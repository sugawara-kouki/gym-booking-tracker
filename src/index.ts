import { Hono } from 'hono'
import { GmailService } from './services/gmail'

type Bindings = {
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
  } catch (error: any) {
    console.error(error)
    return c.json({
      success: false,
      error: error.message
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
  } catch (error: any) {
    console.error(error)
    return c.json({
      success: false,
      error: error.message
    }, 500)
  }
})

export default app
