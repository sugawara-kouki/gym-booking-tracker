import { SyncOrchestrator, SYNC_RUN_STATUS } from '../services/sync-orchestrator'
import type { AppRouteHandler } from '../types'
import {
  emailsRoute,
  dbClearRoute,
  dbTestRoute,
  ingestRoute,
  parsePendingRoute,
  syncRoute,
  syncStatusRoute
} from '../routes/poc.schema'

/**
 * 最近のメール一覧を取得するハンドラー
 */
export const emailsHandler: AppRouteHandler<typeof emailsRoute> = async (c) => {
  const gmail = c.get('gmail')
  // 5件に制限して取得（検証用）
  const messages = await gmail.listMessages(5)

  return c.json({
    success: true as const,
    data: messages
  }, 200)
}

/**
 * データベースの全データをクリアするハンドラー
 * ※自身のデータに限定されるため、他ユーザーのデータは消えません
 */
export const dbClearHandler: AppRouteHandler<typeof dbClearRoute> = async (c) => {
  const repos = c.get('repos')
  const user = c.get('user')

  // 依存関係を考慮し、関連テーブルから順に自身のレコードを消去
  await repos.syncLogs.deleteAll(user.id)
  await repos.syncRuns.deleteAll(user.id)
  await repos.bookings.deleteAll(user.id)
  await repos.rawEmails.deleteAll(user.id)

  return c.json({
    success: true as const,
    message: 'Current user data cleared successfully',
    data: {}
  }, 200)
}

/**
 * データベース接続確認用のハンドラー
 * 現在保存されている自分の予約一覧をそのまま取得する
 */
export const dbTestHandler: AppRouteHandler<typeof dbTestRoute> = async (c) => {
  const repos = c.get('repos')
  const user = c.get('user')
  const results = await repos.bookings.findAll(user.id)

  return c.json({
    success: true as const,
    message: 'Data successfully retrieved',
    data: results
  }, 200)
}

/**
 * Gmailからの取り込み（Ingest）のみを実行するハンドラー
 * インボックスから対象メールを探し、生の本文をDBへ保存するまでを行う
 */
export const ingestHandler: AppRouteHandler<typeof ingestRoute> = async (c) => {
  const user = c.get('user')
  const orchestrator = new SyncOrchestrator(c.env, user.id, c.get('gmail'))
  // 最大500件まで遡ってスキャン
  const result = await orchestrator.ingest(500)

  return c.json({
    success: true as const,
    message: 'Ingest completed',
    data: result
  }, 200)
}

/**
 * 未処理メールの解析処理を実行するハンドラー
 * 保存済みの生のメール本文を順次解析し、予約テーブルへ正規化して保存する
 */
export const parsePendingHandler: AppRouteHandler<typeof parsePendingRoute> = async (c) => {
  const user = c.get('user')
  const orchestrator = new SyncOrchestrator(c.env, user.id, c.get('gmail'))
  const repos = c.get('repos')

  // 同期実行の記録を開始
  const runId = crypto.randomUUID()
  await repos.syncRuns.create(user.id, runId)

  // 未処理分のメールを解析
  const result = await orchestrator.processPending(runId)

  // エラーの有無に基づいて最終的な実行ステータスを確定させる
  const finalStatus = result.errorCount === 0 ? SYNC_RUN_STATUS.SUCCESS : SYNC_RUN_STATUS.PARTIAL_SUCCESS
  await repos.syncRuns.finalize(user.id, runId, finalStatus, result.successCount, result.errorCount)

  return c.json({
    success: true as const,
    message: 'Processing completed',
    data: { ...result, runId }
  }, 200)
}

/**
 * フル同期処理（取り込み＋解析）を非同期バックグラウンドで開始するハンドラー
 */
export const syncHandler: AppRouteHandler<typeof syncRoute> = async (c) => {
  const user = c.get('user')
  const orchestrator = new SyncOrchestrator(c.env, user.id, c.get('gmail'))
  
  const runId = crypto.randomUUID()
  
  // waitUntil を利用してレスポンス終了後もバックグラウンドで処理を継続
  c.executionCtx.waitUntil(
    orchestrator.sync(runId).catch((err) => {
      console.error(`Background sync failed for runId: ${runId}`, err)
    })
  )

  return c.json({
    success: true as const,
    message: 'Sync job started in background',
    data: { runId, success: true }
  }, 202)
}

/**
 * バックグラウンド実行中の同期処理ステータスを取得するハンドラー
 */
export const syncStatusHandler: AppRouteHandler<typeof syncStatusRoute> = async (c) => {
  const user = c.get('user')
  const repos = c.get('repos')
  const { runId } = c.req.valid('param')

  const syncRun = await repos.syncRuns.findById(user.id, runId)
  
  if (!syncRun) {
    return c.json({
      success: false as const,
      error: {
        code: 'NOT_FOUND',
        message: 'Sync run ID not found'
      }
    }, 404)
  }

  return c.json({
    success: true as const,
    message: 'Status fetched successfully',
    data: {
      id: syncRun.id,
      status: syncRun.status,
      total_count: syncRun.total_count,
      success_count: syncRun.success_count,
      error_count: syncRun.error_count
    }
  }, 200)
}
