import { Hono } from 'hono'
import { GmailService } from './services/gmail'
import { SyncOrchestrator } from './services/sync-orchestrator'

export type Bindings = {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REFRESH_TOKEN: string
  gym_booking_db: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => {
  return c.text('Gym Booking Tracker API')
})

/**
 * PoC: Gmailからメール一覧を取得して返すテストエンドポイント
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
 * PoC: 同期処理（SyncOrchestrator）の実行テスト
 */
app.get('/poc/sync', async (c) => {
  try {
    const orchestrator = new SyncOrchestrator(c.env)
    const result = await orchestrator.sync()

    return c.json({
      success: true,
      message: 'Sync completed',
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

export default app
