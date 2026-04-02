import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { jwt } from 'hono/jwt'
import type { UserRow } from '../repositories/types'
import type { Bindings, Variables } from '../types'
import { Logger } from '../utils/logger'

/**
 * 認証済みであることが保証された Variables の型。
 * グローバルな Variables.user (Optional) を必須型に上書き（昇格）させます。
 */
export type AuthenticatedVariables = Variables & {
  user: UserRow
}

export type AuthenticatedContext<T extends string = string> = Context<
  {
    Bindings: Bindings
    Variables: AuthenticatedVariables
  },
  T
>

/**
 * JWTのペイロードをもとに、DBからユーザー情報を取得して Context にセットするミドルウェア。
 * JWT の検証（checkJwt）の後に実行される必要があります。
 */
export const injectUser = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const payload = c.get('jwtPayload')
    if (!payload?.sub) {
      Logger.warn(c, 'Unauthorized: No subject in JWT payload')
      return c.json({ success: false, error: 'Unauthorized: Invalid token' }, 401)
    }

    const userId = payload.sub as string
    const repos = c.get('repos')

    // 防御的設計：injectRepos が先に適用されていない場合のガード
    if (!repos) {
      Logger.error(c, 'Middleware order error: injectRepos must be called before injectUser')
      return c.json({ success: false, error: 'Internal Server Error' }, 500)
    }

    const user = await repos.users.findById(userId)

    if (!user) {
      Logger.warn(c, 'Unauthorized: User not found in database', { userId })
      return c.json({ success: false, error: 'User session invalid' }, 401)
    }

    c.set('user', user)
    await next()
  },
)

/**
 * JWTの検証を行い、ペイロードを Context にセットするミドルウェア。
 */
export const checkJwt = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const jwtMiddleware = jwt({
      secret: c.env.JWT_SECRET,
      cookie: 'auth_token',
      alg: 'HS256',
    })

    try {
      return await jwtMiddleware(c, next)
    } catch (e) {
      Logger.warn(c, 'JWT verification failed', {
        error: e instanceof Error ? e.message : 'Unknown error',
      })
      throw e // Hono の jwt ミドルウェアが適切に例外（401等）を投げるため、そのまま伝播させる
    }
  },
)

/**
 * JWT検証とユーザー取得を一括で行う統合認証ミドルウェア。
 */
export const injectAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    await checkJwt(c, async () => {
      await injectUser(c, next)
    })
  },
)
