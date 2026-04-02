import { OpenAPIHono } from '@hono/zod-openapi'
import { type AuthenticatedVariables, authMiddleware } from '../middleware/auth'
import { injectRepos } from '../middleware/db'
import { type AuthenticatedGmailVariables, injectGmail } from '../middleware/gmail'
import type { Bindings, Variables } from '../types'

/**
 * 基本となる API ルーターを作成します。
 * 全ての API ルートに共通するミドルウェア（injectRepos など）を初期設定します。
 */
export const createRouter = () => {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()
  app.use('*', injectRepos)
  return app
}

/**
 * 認証が必須な API ルーターを作成します。
 * リポジトリ注入に加え、認証ミドルウェアを自動的に適用し、型を AuthenticatedVariables に昇格させます。
 */
export const createAuthRouter = () => {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthenticatedVariables }>()
  app.use('*', injectRepos)
  app.use('*', authMiddleware)
  return app
}

/**
 * Gmail 連携が必須な API ルーターを作成します。
 * 認証と Gmail インジェクションの両方を自動的に適用し、型を AuthenticatedGmailVariables に昇格させます。
 */
export const createGmailRouter = () => {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthenticatedGmailVariables }>()
  app.use('*', injectRepos)
  app.use('*', authMiddleware)
  app.use('*', injectGmail)
  return app
}
