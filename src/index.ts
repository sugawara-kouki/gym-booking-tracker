import { Hono } from 'hono'
import { GmailService } from './services/gmail'

type Bindings = {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REFRESH_TOKEN: string
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

export default app
