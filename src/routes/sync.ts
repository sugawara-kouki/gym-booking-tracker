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
import { injectGmail } from '../middleware/gmail'

export const sync = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

// Attach Gmail middleware for routes that need it
sync.use('/ingest', injectGmail)
sync.use('/parse-pending', injectGmail)
sync.use('/', injectGmail)

sync.openapi(syncRoute, syncHandler)
sync.openapi(syncStatusRoute, syncStatusHandler)
sync.openapi(resetDataRoute, resetDataHandler)

// Debug routes
sync.openapi(ingestRoute, ingestHandler)
sync.openapi(parsePendingRoute, parsePendingHandler)
