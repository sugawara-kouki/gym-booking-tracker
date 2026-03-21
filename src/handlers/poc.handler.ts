import { SyncOrchestrator, SYNC_RUN_STATUS } from '../services/sync-orchestrator'
import type { AppRouteHandler } from '../types'
import { 
  emailsRoute, 
  dbClearRoute, 
  dbTestRoute, 
  ingestRoute, 
  parsePendingRoute, 
  syncRoute 
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
 * ※開発・デバッグ用。本番環境では注意が必要
 */
export const dbClearHandler: AppRouteHandler<typeof dbClearRoute> = async (c) => {
  const repos = c.get('repos')
  
  // 依存関係を考慮し、関連テーブルから順に全てのレコードを消去
  await repos.syncLogs.deleteAll()
  await repos.syncRuns.deleteAll()
  await repos.bookings.deleteAll()
  await repos.rawEmails.deleteAll()

  return c.json({
    success: true as const,
    message: 'All data cleared successfully',
    data: {}
  }, 200)
}

/**
 * データベース接続確認用のハンドラー
 * 現在保存されている予約一覧をそのまま取得する
 */
export const dbTestHandler: AppRouteHandler<typeof dbTestRoute> = async (c) => {
  const repos = c.get('repos')
  const results = await repos.bookings.findAll()

  return c.json({
    success: true as const,
    message: 'D1 Connection Successful',
    data: results
  }, 200)
}

/**
 * Gmailからの取り込み（Ingest）のみを実行するハンドラー
 * インボックスから対象メールを探し、生の本文をDBへ保存するまでを行う
 */
export const ingestHandler: AppRouteHandler<typeof ingestRoute> = async (c) => {
  const orchestrator = new SyncOrchestrator(c.env)
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
  const orchestrator = new SyncOrchestrator(c.env)
  const repos = c.get('repos')
  
  // 同期実行の記録を開始
  const runId = crypto.randomUUID()
  await repos.syncRuns.create(runId)

  // 未処理分のメールを解析
  const result = await orchestrator.processPending(runId)

  // エラーの有無に基づいて最終的な実行ステータスを確定させる
  const finalStatus = result.errorCount === 0 ? SYNC_RUN_STATUS.SUCCESS : SYNC_RUN_STATUS.PARTIAL_SUCCESS
  await repos.syncRuns.finalize(runId, finalStatus, result.successCount, result.errorCount)

  return c.json({
    success: true as const,
    message: 'Processing completed',
    data: { ...result, runId }
  }, 200)
}

/**
 * フル同期処理（取り込み＋解析）を一括で実行するハンドラー
 */
export const syncHandler: AppRouteHandler<typeof syncRoute> = async (c) => {
  const orchestrator = new SyncOrchestrator(c.env)
  const result = await orchestrator.sync()

  return c.json({
    success: true as const,
    message: 'Sync completed (Ingest + Process)',
    data: result
  }, 200)
}
