import { createRepositories } from '../repositories'
import type { BookingRow, SyncLogRow } from '../repositories/types'
import type { Bindings } from '../types'
import { Logger } from '../utils/logger'
import type { GmailService } from './gmail'
import { EmailParser } from './parser'

/**
 * メール解析ステータスの定数
 */
export const PARSE_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAIL: 'fail',
  SKIPPED: 'skipped',
} as const

export type ParseStatus = (typeof PARSE_STATUS)[keyof typeof PARSE_STATUS]

/**
 * 同期実行ステータスの定数
 */
export const SYNC_RUN_STATUS = {
  RUNNING: 'running',
  SUCCESS: 'success',
  PARTIAL_SUCCESS: 'partial_success',
  FAILURE: 'failure',
} as const

export type SyncRunStatus = (typeof SYNC_RUN_STATUS)[keyof typeof SYNC_RUN_STATUS]

/**
 * 同期設定のインターフェース
 */
export interface SyncConfig {
  labelIds?: string[]
  maxResults?: number
}

/**
 * Gmailからのデータ取得、解析、データベース保存を制御するサービスのインターフェース
 */
export interface SyncOrchestrator {
  sync(providedRunId?: string): Promise<{ runId: string; success: boolean }>
  ingest(maxLimit?: number): Promise<{ count: number }>
  processPending(runId: string): Promise<{ successCount: number; errorCount: number }>
}

/**
 * SyncOrchestrator のファクトリ関数
 * 今回のアップデートでマルチテナント（userId）対応となりました。
 */
export const createSyncOrchestrator = (
  env: Bindings,
  userId: string,
  gmailService: GmailService,
): SyncOrchestrator => {
  // APIレート制限やリソース消費を抑えるための並列実行数
  const DB_BATCH_SIZE = 5
  // 札幌市の施設予約システムからのメールのみを対象とするクエリ
  const GMAIL_QUERY = 'subject:"札幌市公共施設予約情報システム"'
  const repos = createRepositories(env.gym_booking_db)
  const gmail = gmailService

  /**
   * 同期実行の開始を記録
   */
  const initSyncRun = async (runId: string) => {
    await repos.syncRuns.create(userId, runId)
  }

  /**
   * 同期全体の最終ステータスを確定
   */
  const finalizeSyncRun = async (runId: string, successCount: number, errorCount: number) => {
    // 全件成功なら SUCCESS、一部成功なら PARTIAL_SUCCESS、全件失敗なら FAILURE
    const finalStatus =
      errorCount === 0
        ? SYNC_RUN_STATUS.SUCCESS
        : successCount > 0
          ? SYNC_RUN_STATUS.PARTIAL_SUCCESS
          : SYNC_RUN_STATUS.FAILURE

    await repos.syncRuns.finalize(userId, runId, finalStatus, successCount, errorCount)
  }

  return {
    /**
     * Gmailと同期してデータベースを更新するメイン処理
     */
    async sync(providedRunId?: string): Promise<{ runId: string; success: boolean }> {
      const runId = providedRunId || crypto.randomUUID()

      // 同期実行の開始を記録
      await initSyncRun(runId)

      try {
        // Gmailから未取得メールを取り込む（Ingest層）
        const { count: ingestedCount } = await this.ingest()

        // 今回の実行で処理すべき総件数を保存
        await repos.syncRuns.updateTotalCount(userId, runId, ingestedCount)

        // 取り込んだ未処理メールを解析する（Process層）
        const { successCount, errorCount } = await this.processPending(runId)

        // 同期全体の最終ステータスを確定
        await finalizeSyncRun(runId, successCount, errorCount)

        return { runId, success: true }
      } catch (err: unknown) {
        Logger.error(null, 'Fatal error in sync orchestrator', { runId, error: err })
        // 致命的なエラー時はステータスを FAILURE に設定
        await repos.syncRuns.finalize(userId, runId, SYNC_RUN_STATUS.FAILURE, 0, 0)
        return { runId, success: false }
      }
    },

    /**
     * Gmail APIからメッセージを取得し、raw_emails テーブルに保存する。
     */
    async ingest(maxLimit: number = 2000): Promise<{ count: number }> {
      // 最新の成功した同期日時を取得し、クエリに追加する（効率化）
      const lastSuccess = await repos.syncRuns.findLastSuccess(userId)
      let query = GMAIL_QUERY

      if (lastSuccess?.executed_at) {
        // 余裕を持たせて1日前から検索する
        const afterDate = new Date((lastSuccess.executed_at - 86400) * 1000)
        const yyyy = afterDate.getFullYear()
        const mm = String(afterDate.getMonth() + 1).padStart(2, '0')
        const dd = String(afterDate.getDate()).padStart(2, '0')
        query += ` after:${yyyy}/${mm}/${dd}`
      }

      Logger.info(null, 'Starting ingest process', { query, userId })
      let ingested = 0
      let pageToken: string | undefined
      let totalScanned = 0
      let stopSync = false

      do {
        // ページごとにメッセージ一覧を取得
        const result = await gmail.listMessages(50, query, pageToken)
        const messages = result.messages
        pageToken = result.nextPageToken

        if (messages.length === 0) break

        // バッチ処理（5件ずつ並列に詳細を取得してDB負荷を分散）
        for (let i = 0; i < messages.length; i += DB_BATCH_SIZE) {
          if (stopSync) break

          const batch = messages.slice(i, i + DB_BATCH_SIZE)

          // バッチ内のメッセージがDBに存在するか一括チェック（無駄な fetch を防ぐ）
          const checkResults = await Promise.all(
            batch.map(async (msg: { id: string }) => {
              const existing = await repos.rawEmails.findById(userId, msg.id)
              return { msg, existing: !!existing }
            }),
          )

          // 未取得分のみ抽出
          const toFetch = checkResults.filter((r) => !r.existing)

          // 差分同期の停止判断：
          if (!lastSuccess && checkResults.some((r) => r.existing)) {
            Logger.info(null, 'Found already ingested message (Full sync). Stopping scan.', {
              userId,
            })
            stopSync = true
          }

          if (toFetch.length > 0) {
            const fetchedDetails = await Promise.all(
              toFetch.map(async ({ msg }) => {
                try {
                  const detail = await gmail.getMessage(msg.id)
                  return {
                    id: detail.id,
                    thread_id: detail.threadId,
                    subject: detail.subject,
                    snippet: detail.snippet,
                    body: detail.body || null,
                    parse_status: PARSE_STATUS.PENDING as ParseStatus,
                  }
                } catch (err) {
                  Logger.error(null, 'Failed to fetch message', {
                    messageId: msg.id,
                    userId,
                    error: err,
                  })
                  return null
                }
              }),
            )

            const validDetails = fetchedDetails.filter(
              (d): d is NonNullable<typeof d> => d !== null,
            )
            if (validDetails.length > 0) {
              await repos.rawEmails.batchCreate(userId, validDetails)
              ingested += validDetails.length
            }
          }

          totalScanned += batch.length

          // 際限ないスキャンを防ぐための安全装置
          if (totalScanned >= maxLimit) {
            Logger.info(null, 'Reached maxLimit. Stopping.', { maxLimit, userId })
            stopSync = true
            break
          }
        }

        if (stopSync) {
          pageToken = undefined
        }
      } while (pageToken)

      Logger.info(null, 'Ingest finished', { ingested, totalScanned, userId })
      return { count: ingested }
    },

    /**
     * raw_emails テーブルの未処理データを解析し、bookings テーブルに反映する。
     */
    async processPending(runId: string): Promise<{ successCount: number; errorCount: number }> {
      const results = await repos.rawEmails.findPending(userId)

      Logger.info(null, 'Found emails to process', {
        count: results.length,
        runId,
        userId,
      })

      if (results.length === 0) {
        return { successCount: 0, errorCount: 0 }
      }

      const bookingsToUpsert: Omit<BookingRow, 'user_id' | 'updated_at'>[] = []
      const rawEmailUpdates: { id: string; status: ParseStatus }[] = []
      const syncLogsToCreate: Omit<SyncLogRow, 'user_id'>[] = []
      let successCount = 0
      let errorCount = 0

      for (const row of results) {
        const content = row.body || row.snippet
        try {
          const parsed = EmailParser.parse(content, row.subject)

          if (!parsed) {
            rawEmailUpdates.push({ id: row.id, status: PARSE_STATUS.SKIPPED })
            successCount++
            continue
          }

          // 予約情報の準備
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
            error_detail: `Status: ${parsed.status}`,
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

      // バッチ実行
      if (bookingsToUpsert.length > 0) {
        await repos.bookings.batchUpsert(userId, bookingsToUpsert)
      }
      if (rawEmailUpdates.length > 0) {
        await repos.rawEmails.batchUpdateParseStatus(userId, rawEmailUpdates)
      }
      if (syncLogsToCreate.length > 0) {
        await repos.syncLogs.batchCreate(userId, syncLogsToCreate)
      }

      return { successCount, errorCount }
    },
  }
}
