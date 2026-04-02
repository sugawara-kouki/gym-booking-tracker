import { createMiddleware } from 'hono/factory'
import { createGmailService, type GmailService } from '../services/gmail'
import type { Bindings } from '../types'
import { decryptToken, encryptToken } from '../utils/crypto'
import { Logger } from '../utils/logger'
import type { AuthenticatedVariables } from './auth'

/**
 * 認証済みかつ GmailService が準備できていることが保証された Variables の型
 */
export type AuthenticatedGmailVariables = AuthenticatedVariables & {
  gmail: GmailService
}

/**
 * GmailService を初期化して Context にセットするミドルウェア。
 */
export const injectGmail = createMiddleware<{
  Bindings: Bindings
  Variables: AuthenticatedVariables
}>(async (c, next) => {
  const user = c.get('user')

  if (!user?.refresh_token_encrypted) {
    Logger.warn(c, 'Gmail connection missing: No refresh token stored', { userId: user?.id })
    return c.json({ success: false, error: 'Google account not connected' }, 401)
  }

  try {
    const refreshToken = await decryptToken(user.refresh_token_encrypted, c.env.ENCRYPTION_KEY)

    // キャッシュされたアクセストークンの復号（失敗してもリフレッシュされるため、Warn ログに留める）
    let accessToken = null
    if (user.access_token_encrypted) {
      try {
        accessToken = await decryptToken(user.access_token_encrypted, c.env.ENCRYPTION_KEY)
      } catch (e) {
        Logger.warn(c, 'Failed to decrypt cached access token, proceeding to refresh', {
          userId: user.id,
          error: e instanceof Error ? e.message : 'Unknown error',
        })
      }
    }

    const gmail = createGmailService(
      {
        GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REFRESH_TOKEN: refreshToken,
      },
      {
        accessToken,
        expiresAt: user.access_token_expires_at,
        onTokenRefresh: async (newToken: string, expiresAt: number) => {
          Logger.info(c, 'Gmail access token refreshed, updating database', { userId: user.id })
          try {
            const encrypted = await encryptToken(newToken, c.env.ENCRYPTION_KEY)
            const repos = c.get('repos')

            const { created_at: _c, updated_at: _u, ...userData } = user
            await repos.users.upsert({
              ...userData,
              access_token_encrypted: encrypted,
              access_token_expires_at: expiresAt,
            })
          } catch (e) {
            Logger.error(c, 'Failed to update refreshed Gmail token in database', {
              userId: user.id,
              error: e instanceof Error ? e.message : 'Unknown error',
            })
          }
        },
      },
    )

    c.set('gmail', gmail)
    await next()
  } catch (e) {
    Logger.error(c, 'Critical error in Gmail middleware: token decryption failed', {
      userId: user.id,
      error: e instanceof Error ? e.message : 'Unknown error',
    })
    return c.json({ success: false, error: 'Authentication data corrupted. Please re-login.' }, 401)
  }
})
