import { OpenAPIHono } from '@hono/zod-openapi'
import { injectUser, checkJwt } from '../middleware/auth'
import { injectGmail } from '../middleware/gmail'
import type { Bindings, Variables } from '../types'
import * as schemas from './poc.schema'
import * as handlers from '../handlers/poc.handler'

export const poc = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

// POCルート全体に適用するミドルウェア
poc.use('*', checkJwt)
poc.use('*', injectUser)
poc.use('*', injectGmail)

// --- Routing ---

poc.openapi(schemas.emailsRoute, handlers.emailsHandler)
poc.openapi(schemas.dbClearRoute, handlers.dbClearHandler)
poc.openapi(schemas.dbTestRoute, handlers.dbTestHandler)
poc.openapi(schemas.ingestRoute, handlers.ingestHandler)
poc.openapi(schemas.parsePendingRoute, handlers.parsePendingHandler)
poc.openapi(schemas.syncRoute, handlers.syncHandler)
poc.openapi(schemas.syncStatusRoute, handlers.syncStatusHandler)
