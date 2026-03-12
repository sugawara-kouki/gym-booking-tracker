import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { GmailService } from './services/gmail'
import { SyncOrchestrator } from './services/sync-orchestrator'

export type Bindings = {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REFRESH_TOKEN: string
  gym_booking_db: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// Swagger UI (localhost:8080) からのリクエストを許可するためのCORS設定
app.use('*', cors({
  origin: 'http://localhost:8080',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

app.get('/', (c) => {
  return c.text('Gym Booking Tracker API')
})

/**
 * PoC: Gmailからメール一覧を取得して返すテストエンドポイント
 * 認可とAPIの疎通確認に使用
 */
app.get('/poc/emails', async (c) => {
  try {
    const gmail = new GmailService(c.env)
    const messages = await gmail.listMessages(5)

    return c.json({
      success: true,
      data: messages
    })
  } catch (error: unknown) {
    // エラーオブジェクトからメッセージを安全に抽出
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false,
      error: errorMessage
    }, 500)
  }
})

/**
 * PoC: データベースの全データをクリア
 */
app.get('/poc/db-clear', async (c) => {
  try {
    const db = c.env.gym_booking_db
    // 外部キー制約を考慮した順序、または一度オフにして削除
    await db.batch([
      db.prepare('DELETE FROM sync_logs'),
      db.prepare('DELETE FROM sync_runs'),
      db.prepare('DELETE FROM bookings'),
      db.prepare('DELETE FROM raw_emails')
    ])

    return c.json({
      success: true,
      message: 'All data cleared successfully'
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false,
      error: errorMessage
    }, 500)
  }
})

/**
 * PoC: D1 データベースへの接続テスト
 * テーブルの読み取り権限とデータの存在確認に使用
 */
app.get('/poc/db-test', async (c) => {
  try {
    const db = c.env.gym_booking_db
    const results = await db.prepare('SELECT * FROM bookings').all()

    return c.json({
      success: true,
      message: 'D1 Connection Successful',
      data: results
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false,
      error: errorMessage
    }, 500)
  }
})

/**
 * PoC: Gmailからの取り込み（Ingest）のみを実行
 */
app.get('/poc/ingest', async (c) => {
  try {
    const orchestrator = new SyncOrchestrator(c.env)
    const result = await orchestrator.ingest(500)

    return c.json({
      success: true,
      message: 'Ingest completed',
      data: result
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false,
      error: errorMessage
    }, 500)
  }
})

/**
 * PoC: DB内の未処理メールの解析（Parse Pending）のみを実行
 */
app.get('/poc/parse-pending', async (c) => {
  try {
    const orchestrator = new SyncOrchestrator(c.env)
    const runId = crypto.randomUUID()
    const db = c.env.gym_booking_db

    // sync_logs.sync_run_id の外部キー制約を満たすため、実行ログを作成
    await db.prepare(`
      INSERT INTO sync_runs (id, status, total_count, success_count, error_count)
      VALUES (?, 'running_manual', 0, 0, 0)
    `).bind(runId).run()

    const result = await orchestrator.processPending(runId)

    // 実行結果を更新
    const finalStatus = result.errorCount === 0 ? 'success' : 'partial_success'
    await db.prepare(`
      UPDATE sync_runs 
      SET status = ?, success_count = ?, error_count = ?, executed_at = unixepoch()
      WHERE id = ?
    `).bind(finalStatus, result.successCount, result.errorCount, runId).run()

    return c.json({
      success: true,
      message: 'Processing completed',
      data: { ...result, runId }
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false,
      error: errorMessage
    }, 500)
  }
})

/**
 * PoC: 同期処理（SyncOrchestrator）の実行テスト
 * 実際のフェッチ・パース・保存の一連の流れを確認に使用
 */
app.get('/poc/sync', async (c) => {
  try {
    const orchestrator = new SyncOrchestrator(c.env)
    const result = await orchestrator.sync()

    return c.json({
      success: true,
      message: 'Sync completed (Ingest + Process)',
      data: result
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false,
      error: errorMessage
    }, 500)
  }
})

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log(`[Scheduled] Job started: ${event.cron}`);
    const orchestrator = new SyncOrchestrator(env);
    const result = await orchestrator.sync();
    console.log(`[Scheduled] Job completed. Run ID: ${result.runId}, Success: ${result.success}`);
  }
}
