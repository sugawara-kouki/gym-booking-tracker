import { RouteConfig, RouteHandler } from '@hono/zod-openapi'
import type { UserRow } from './repositories/types'
import type { GmailService } from './services/gmail'
import type { Repositories } from './repositories'
import type { AuthenticatedVariables } from './middleware/auth'

export type Bindings = {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REFRESH_TOKEN: string
  ENCRYPTION_KEY: string
  JWT_SECRET: string
  gym_booking_db: D1Database
}

export type Variables = {
  jwtPayload: {
    sub: string
    email: string
  }
  /**
   * 認証済みユーザー情報。デフォルトではオプショナルです。
   * 認証必須ルートでは AuthenticatedVariables を使用して「必須型」に昇格させます。
   * 詳細は DOCS_AUTH_ARCHITECTURE.md を参照。
   */
  user?: UserRow
  gmail: GmailService
  requestId: string
  repos: Repositories
}

export type AppRouteHandler<T extends RouteConfig> = RouteHandler<T, { Bindings: Bindings, Variables: Variables }>
export type AuthenticatedRouteHandler<T extends RouteConfig> = RouteHandler<T, { Bindings: Bindings, Variables: AuthenticatedVariables }>
