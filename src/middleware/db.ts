import { createMiddleware } from 'hono/factory'
import { createRepositories } from '../repositories'
import type { Bindings, Variables } from '../types'

/**
 * リポジトリを Context に注入するミドルウェア
 * 各ハンドラーで createRepositories を呼び出す冗長さを解消します
 */
export const injectRepos = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const repos = createRepositories(c.env.gym_booking_db)
    c.set('repos', repos)
    await next()
  },
)
