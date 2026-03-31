import { OpenAPIHono } from '@hono/zod-openapi'
import {
  ingestHandler,
  parsePendingHandler,
  resetDataHandler,
  syncHandler,
  syncStatusHandler,
} from '../handlers/sync.handler'
import { type AuthenticatedVariables, authMiddleware } from '../middleware/auth'
import { type AuthenticatedGmailVariables, injectGmail } from '../middleware/gmail'
import type { Bindings } from '../types'
import {
  ingestRoute,
  parsePendingRoute,
  resetDataRoute,
  syncRoute,
  syncStatusRoute,
} from './sync.schema'

/**
 * 認証済みユーザー向けのルーター定義。
 * AuthenticatedVariables を指定することで、配下のハンドラーで user が必須型に昇格します。
 * 詳細は DOCS_AUTH_ARCHITECTURE.md を参照。
 */
const app = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthenticatedVariables }>()

app.use('*', authMiddleware)

// Gmail 不要なルート（ベースアプリに直接登録）
app.openapi(syncStatusRoute, syncStatusHandler)
app.openapi(resetDataRoute, resetDataHandler)

// Gmail 必要なルート（型昇格したサブルーターに登録）
const gmailApp = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthenticatedGmailVariables }>()
gmailApp.use('*', injectGmail)

gmailApp.openapi(syncRoute, syncHandler)
gmailApp.openapi(ingestRoute, ingestHandler)
gmailApp.openapi(parsePendingRoute, parsePendingHandler)

app.route('/', gmailApp)

export const sync = app
