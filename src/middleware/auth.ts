import { createMiddleware } from 'hono/factory'
import { jwt } from 'hono/jwt'
import type { Bindings, Variables } from '../types'

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
