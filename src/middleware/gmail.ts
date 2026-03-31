import { createMiddleware } from 'hono/factory'
import { GmailService } from '../services/gmail'
import type { Bindings } from '../types'
import { decryptToken } from '../utils/crypto'
import type { AuthenticatedVariables } from './auth'

/**
 * 認証済みかつ GmailService が準備できていることが保証された Variables の型
 */
export type AuthenticatedGmailVariables = AuthenticatedVariables & {
  gmail: GmailService
}

/**
 * GmailService を初期化して Context にセットするミドルウェア
 * ※ injectUser の後に実行される必要があります
 */
export const injectGmail = createMiddleware<{
  Bindings: Bindings
  Variables: AuthenticatedVariables
}>(async (c, next) => {
  const user = c.get('user')

  if (!user || !user.refresh_token_encrypted) {
    return c.json({ success: false, error: 'Google account not connected' }, 401)
  }

  const refreshToken = await decryptToken(user.refresh_token_encrypted, c.env.ENCRYPTION_KEY)

  // キャッシュされたアクセストークンがあれば復号
  let accessToken = null
  if (user.access_token_encrypted) {
    try {
      accessToken = await decryptToken(user.access_token_encrypted, c.env.ENCRYPTION_KEY)
    } catch (e) {
      console.warn('Failed to decrypt cached access token, will refresh:', e)
    }
  }

  const gmail = new GmailService(
    {
      GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN: refreshToken,
    },
    {
      accessToken,
      expiresAt: user.access_token_expires_at,
      onTokenRefresh: async (newToken, expiresAt) => {
        const { encryptToken } = await import('../utils/crypto')
        const encrypted = await encryptToken(newToken, c.env.ENCRYPTION_KEY)
        const repos = c.get('repos')
        await repos.users.upsert({
          id: user.id,
          provider: user.provider,
          provider_user_id: user.provider_user_id,
          email: user.email,
          name: user.name,
          refresh_token_encrypted: user.refresh_token_encrypted,
          access_token_encrypted: encrypted,
          access_token_expires_at: expiresAt,
        })
      },
    },
  )

  c.set('gmail', gmail)
  await next()
})
