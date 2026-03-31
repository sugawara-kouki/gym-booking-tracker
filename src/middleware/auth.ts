import { createMiddleware } from 'hono/factory'
import { jwt } from 'hono/jwt'
import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import type { Bindings, Variables } from '../types'
import type { UserRow } from '../repositories/types'

/**
 * 認証済みであることが保証された Variables の型。
 * グローバルな Variables.user (Optional) を必須型に上書き（昇格）させます。
 * 詳細は DOCS_AUTH_ARCHITECTURE.md を参照。
 */
export type AuthenticatedVariables = Variables & {
  /**
   * 認証済みユーザー情報。デフォルトではオプショナルです。
   * 認証必須ルートでは AuthenticatedVariables を使用して「必須型」に昇格させます。
   * 詳細は DOCS_AUTH_ARCHITECTURE.md を参照。
   */
  user: UserRow
}

export type AuthenticatedContext<T extends string = string> = Context<{
  Bindings: Bindings,
  Variables: AuthenticatedVariables
}, T>

/**
 * JWTのペイロードをもとに、DBからユーザー情報を取得して Context にセットするミドルウェア
 * ※ injectRepos の後に実行される必要があります
 */
export const injectUser = createMiddleware<{ Bindings: Bindings, Variables: Variables }>(async (c, next) => {
  const payload = c.get('jwtPayload')
  if (!payload || !payload.sub) {
    return c.json({ success: false, error: 'Unauthorized: Invalid JWT payload' }, 401)
  }

  const userId = payload.sub
  const repos = c.get('repos')
  const user = await repos.users.findById(userId)

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 401)
  }

  c.set('user', user)
  await next()
})

/**
 * JWTの検証を行い、ペイロードを Context にセットするミドルウェア
 */
export const checkJwt = createMiddleware<{ Bindings: Bindings, Variables: Variables }>(async (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
    cookie: 'auth_token',
    alg: 'HS256'
  })
  return jwtMiddleware(c, next)
})

/**
 * JWT検証とユーザー取得をまとめた統合認証ミドルウェア
 */
export const authMiddleware = createMiddleware<{ Bindings: Bindings, Variables: Variables }>(async (c, next) => {
  await checkJwt(c, async () => {
    await injectUser(c, next)
  })
})
