import { OpenAPIHono } from '@hono/zod-openapi'
import type { Bindings, Variables } from '../types'
import {
  syncRoute,
  syncStatusRoute,
  resetDataRoute,
  ingestRoute,
  parsePendingRoute
} from './sync.schema'
import {
  syncHandler,
  syncStatusHandler,
  resetDataHandler,
  ingestHandler,
  parsePendingHandler
} from '../handlers/sync.handler'
import { authMiddleware, type AuthenticatedVariables } from '../middleware/auth'
import { injectGmail } from '../middleware/gmail'

/**
 * 認証済みユーザー向けのルーター定義。
 * AuthenticatedVariables を指定することで、配下のハンドラーで user が必須型に昇格します。
 * 詳細は DOCS_AUTH_ARCHITECTURE.md を参照。
 */
const app = new OpenAPIHono<{ Bindings: Bindings, Variables: AuthenticatedVariables }>()

app.use('*', authMiddleware)
app.use('/ingest', injectGmail)
app.use('/parse-pending', injectGmail)
app.use('/', injectGmail)

export const sync = app
  .openapi(syncRoute, syncHandler)
  .openapi(syncStatusRoute, syncStatusHandler)
  .openapi(resetDataRoute, resetDataHandler)
  .openapi(ingestRoute, ingestHandler)
  .openapi(parsePendingRoute, parsePendingHandler)
