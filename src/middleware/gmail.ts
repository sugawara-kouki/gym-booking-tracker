import { createMiddleware } from 'hono/factory'
import { decryptToken } from '../utils/crypto'
import { GmailService } from '../services/gmail'
import type { Bindings, Variables } from '../types'

/**
 * すでに Context にセットされているユーザー情報をもとに、
 * GmailService を初期化して Context にセットするミドルウェア
 * ※ injectUser の後に実行される必要があります
 */
export const injectGmail = createMiddleware<{ Bindings: Bindings, Variables: Variables }>(async (c, next) => {
  const user = c.get('user')
  
  if (!user || !user.refresh_token_encrypted) {
    return c.json({ success: false, error: 'Google account not connected' }, 401)
  }

  const refreshToken = await decryptToken(user.refresh_token_encrypted, c.env.ENCRYPTION_KEY)
  
  const gmail = new GmailService({
    GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: refreshToken
  })

  c.set('gmail', gmail)
  await next()
})
