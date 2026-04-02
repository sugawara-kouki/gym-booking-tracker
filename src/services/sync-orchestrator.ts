import {
  PARSE_STATUS,
  type ParseStatus,
  SYNC_RUN_STATUS,
  type SyncRunStatus,
} from '../constants/status'
import type { BookingRow, RawEmailRow, Repositories, SyncLogRow } from '../repositories/types'
import { Logger } from '../utils/logger'
import type { GmailService } from './gmail'
import { EmailParser } from './parser'

// Gmail の検索クエリ（札幌市のシステムからの通知を対象にする）
const GMAIL_QUERY = 'from:do-not-reply@e-harp.jp'
// データベースへのバッチ処理単位
const DB_BATCH_SIZE = 50
// 一度に取得するメッセージの最大数
const MAX_INGEST_LIMIT = 2000
// Gmail API の同時リクエスト数制限を考慮した並列数
const FETCH_CONCURRENCY_LIMIT = 10

/**
 * Gmail とローカル DB の同期を制御するオーケストレーターのファクトリ。
 */
export const createSyncOrchestrator = (
  userId: string,
  repos: Repositories,
  gmail: GmailService,
) => {
  /** 内部用：同期実行の初期化 */
  const initSyncRun = async (runId: string) => {
    await repos.syncRuns.create(userId, runId)
  }

  /** 内部用：同期の最終ステータス確定 */
  const finalizeSyncRun = async (runId: string, successCount: number, errorCount: number) => {
    const finalStatus: SyncRunStatus =
      errorCount > 0 ? SYNC_RUN_STATUS.FAILURE : SYNC_RUN_STATUS.SUCCESS
    await repos.syncRuns.finalize(userId, runId, finalStatus, successCount, errorCount)
  }

  return {
    /**
     * Gmailと同期してデータベースを更新するメイン処理
     */
    async sync(providedRunId?: string): Promise<{ runId: string; success: boolean }> {
      const runId = providedRunId || crypto.randomUUID()

      await initSyncRun(runId)

      try {
        const { count: ingestedCount } = await this.ingest(MAX_INGEST_LIMIT)
        await repos.syncRuns.updateTotalCount(userId, runId, ingestedCount)

        const { successCount, errorCount } = await this.processPending(runId)
        await finalizeSyncRun(runId, successCount, errorCount)

        return { runId, success: true }
      } catch (err: unknown) {
        Logger.error(null, 'Fatal error in sync orchestrator', { runId, error: err })
        await repos.syncRuns.finalize(userId, runId, SYNC_RUN_STATUS.FAILURE, 0, 0)
        return { runId, success: false }
      }
    },

    /**
     * Gmail APIからメッセージを取得し、未処理分を DB に保存する（Ingest 層）
     */
    async ingest(maxLimit: number): Promise<{ count: number }> {
      // 改善：DB 登録日時ではなく、メール本来の受信日時（received_at）を基準にする
      const latestReceivedAt = await repos.rawEmails.findLatestReceivedAt(userId)
      let query = GMAIL_QUERY

      if (latestReceivedAt) {
        // 最新メールの受信日時から 1 日引いたバッファを持たせ、取りこぼしを防ぐ
        const afterDate = new Date((latestReceivedAt - 86400) * 1000)
        const yyyy = afterDate.getFullYear()
        const mm = String(afterDate.getMonth() + 1).padStart(2, '0')
        const dd = String(afterDate.getDate()).padStart(2, '0')
        query += ` after:${yyyy}/${mm}/${dd}`
      }

      Logger.info(null, 'Starting ingest process', { query, userId })
      let ingestedCount = 0
      let pageToken: string | undefined
      let totalScanned = 0
      let stopSync = false

      do {
        const result = await gmail.listMessages(50, query, pageToken)
        const messages = result.messages
        pageToken = result.nextPageToken

        if (messages.length === 0) break

        // バッチごとに処理
        for (let i = 0; i < messages.length; i += DB_BATCH_SIZE) {
          if (stopSync) break

          const batch = messages.slice(i, i + DB_BATCH_SIZE)
          const allIds = batch.map((m) => m.id)

          // 既読 ID を一括フィルタリング
          const existingIds = await repos.rawEmails.filterExistingIds(userId, allIds)
          const existingSet = new Set(existingIds)

          const toFetch = batch.filter((m) => !existingSet.has(m.id))

          if (toFetch.length > 0) {
            const validDetails: Omit<RawEmailRow, 'user_id' | 'fetched_at'>[] = []

            // Gmail API の同時接続制限を回避するため、並列数を制限してフェッチ
            for (let j = 0; j < toFetch.length; j += FETCH_CONCURRENCY_LIMIT) {
              const chunk = toFetch.slice(j, j + FETCH_CONCURRENCY_LIMIT)
              const chunkDetails = await Promise.all(
                chunk.map(async (msg) => {
                  try {
                    const detail = await gmail.getMessage(msg.id)
                    // DB の RawEmailRow に合わせた形式に変換
                    return {
                      id: detail.id,
                      thread_id: detail.threadId,
                      subject: detail.subject,
                      snippet: detail.snippet,
                      body: detail.body || null,
                      received_at: detail.receivedAt, // 本来の受信日時をセット
                      parse_status: PARSE_STATUS.PENDING as ParseStatus,
                    }
                  } catch (err) {
                    Logger.error(null, 'Failed to fetch message detail', {
                      messageId: msg.id,
                      userId,
                      error: err,
                    })
                    return null
                  }
                }),
              )
              validDetails.push(
                ...chunkDetails.filter(
                  (d): d is Omit<RawEmailRow, 'user_id' | 'fetched_at'> => d !== null,
                ),
              )
            }

            if (validDetails.length > 0) {
              await repos.rawEmails.batchCreate(userId, validDetails)
              ingestedCount += validDetails.length
            }
          }

          totalScanned += batch.length
          if (totalScanned >= maxLimit) {
            Logger.info(null, 'Reached maxLimit during ingest', { maxLimit, userId })
            stopSync = true
            break
          }
        }

        if (stopSync) pageToken = undefined
      } while (pageToken)

      Logger.info(null, `Ingest finished. Total new messages: ${ingestedCount}`, { userId })
      return { count: ingestedCount }
    },

    /**
     * raw_emails テーブルの未処理データを解析し、bookings テーブルに反映する（Process 層）
     */
    async processPending(runId: string): Promise<{ successCount: number; errorCount: number }> {
      const pendingEmails = await repos.rawEmails.findPending(userId)

      if (pendingEmails.length === 0) return { successCount: 0, errorCount: 0 }

      const bookingsToUpsert: Omit<BookingRow, 'user_id' | 'updated_at'>[] = []
      const rawEmailUpdates: { id: string; status: ParseStatus }[] = []
      const syncLogsToCreate: Omit<SyncLogRow, 'user_id'>[] = []
      let successCount = 0
      let errorCount = 0

      for (const row of pendingEmails) {
        const content = row.body || row.snippet
        try {
          const parsed = EmailParser.parse(content, row.subject)

          if (!parsed) {
            rawEmailUpdates.push({ id: row.id, status: PARSE_STATUS.SKIPPED })
            successCount++
            continue
          }

          bookingsToUpsert.push({
            id: parsed.registration_number || crypto.randomUUID(),
            facility_name: parsed.facility_name,
            event_date: parsed.event_date,
            event_end_date: parsed.event_end_date || null,
            registration_number: parsed.registration_number || null,
            purpose: parsed.purpose || null,
            court_info: parsed.court_info || null,
            status: parsed.status,
            raw_mail_id: row.id,
          })

          rawEmailUpdates.push({ id: row.id, status: PARSE_STATUS.SUCCESS })
          syncLogsToCreate.push({
            id: crypto.randomUUID(),
            sync_run_id: runId,
            raw_mail_id: row.id,
            status: PARSE_STATUS.SUCCESS,
            error_detail: `Success: ${parsed.status}`,
          })
          successCount++
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          rawEmailUpdates.push({ id: row.id, status: PARSE_STATUS.FAIL })
          syncLogsToCreate.push({
            id: crypto.randomUUID(),
            sync_run_id: runId,
            raw_mail_id: row.id,
            status: 'error',
            error_detail: `FAIL: ${msg}`,
          })
          errorCount++
        }
      }

      // バッチ実行（D1.batch を活用）
      if (bookingsToUpsert.length > 0) await repos.bookings.batchUpsert(userId, bookingsToUpsert)
      if (rawEmailUpdates.length > 0)
        await repos.rawEmails.batchUpdateParseStatus(userId, rawEmailUpdates)
      if (syncLogsToCreate.length > 0) await repos.syncLogs.batchCreate(userId, syncLogsToCreate)

      Logger.info(null, `Process finished: ${successCount} success, ${errorCount} error`, {
        runId,
        userId,
      })

      return { successCount, errorCount }
    },
  }
}
