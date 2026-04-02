import { createMiddleware } from 'hono/factory'
import { createRepositories } from '../repositories'
import type { Bindings, Variables } from '../types'
import { Logger } from '../utils/logger'

/**
 * リポジトリを Context に注入するミドルウェア。
 * 各ハンドラーで createRepositories を呼び出す冗長さを解消します。
 * API サーバーの「基礎（Base）」として機能します。
 */
export const injectRepos = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const repos = createRepositories(c.env.gym_booking_db)
    c.set('repos', repos)

    // デバッグ用の構造化ログ（不必要な場合は将来的に削除可能）
    Logger.debug(c, 'Repositories injected into context')

    await next()
  },
)
