import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { type AuthenticatedVariables, injectAuth } from '../middleware/auth'
import { injectRepos } from '../middleware/db'
import { type AuthenticatedGmailVariables, injectGmail } from '../middleware/gmail'
import type { Bindings, Variables } from '../types'
import { Logger } from './logger'

/**
 * アプリケーション全体のルートを作成します。
 * API/UI共通のミドルウェア(requestId, logger, cors, secureHeaders など) を初期設定します。
 */
export const createGlobalRouter = () => {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

  // セキュリティヘッダーの付与
  app.use('*', secureHeaders())

  // リクエストIDを取得するミドルウェア
  app.use('*', requestId())

  // カスタム構造化ロガー
  app.use('*', async (c, next) => {
    const start = Date.now()
    await next()
    const end = Date.now()

    Logger.info(c, 'Request completed', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      latency: `${end - start}ms`,
    })
  })

  // CORS設定: どこからでもアクセス可能
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  )

  return app
}

/**
 * API ルーター作成時の共通設定
 * ミドルウェアの適用順序を一貫させるために配列で管理します。
 *
 * 【重要】Hono の .use() で正しく型推論を効かせるため、
 * ミドルウェアの配列は as const で定義し、スプレッド構文で適用します。
 */
const apiBaseMiddlewares = [injectRepos] as const
const apiAuthMiddlewares = [...apiBaseMiddlewares, injectAuth] as const
const apiGmailMiddlewares = [...apiAuthMiddlewares, injectGmail] as const

/**
 * 基本となる API ルーターを作成します。
 * 全ての API ルートに共通するミドルウェア（injectRepos など）を初期設定します。
 * 認証不要な公開 API に適しています。
 */
export const createAPIBaseRouter = () => {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()
  app.use('*', ...apiBaseMiddlewares)
  return app
}

/**
 * 認証が必須な API ルーターを作成します。
 * リポジトリ注入に加え、認証ミドルウェアを自動的に適用し、型を AuthenticatedVariables に昇格させます。
 */
export const createAuthRouter = () => {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthenticatedVariables }>()
  app.use('*', ...apiAuthMiddlewares)
  return app
}

/**
 * Gmail 連携が必須な API ルーターを作成します。
 * 認証と Gmail インジェクションの両方を自動的に適用し、型を AuthenticatedGmailVariables に昇格させます。
 */
export const createGmailRouter = () => {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthenticatedGmailVariables }>()
  app.use('*', ...apiGmailMiddlewares)
  return app
}
