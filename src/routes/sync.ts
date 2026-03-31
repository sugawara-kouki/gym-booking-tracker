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
import { checkJwt, injectUser } from '../middleware/auth'

const app = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

app.use('*', checkJwt)
app.use('*', injectUser)
app.use('/ingest', injectGmail)
app.use('/parse-pending', injectGmail)
app.use('/', injectGmail)

export const sync = app
  .openapi(syncRoute, syncHandler)
  .openapi(syncStatusRoute, syncStatusHandler)
  .openapi(resetDataRoute, resetDataHandler)
  .openapi(ingestRoute, ingestHandler)
  .openapi(parsePendingRoute, parsePendingHandler)
