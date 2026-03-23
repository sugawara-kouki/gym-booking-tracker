import { OpenAPIHono } from '@hono/zod-openapi'
import { injectUser, checkJwt } from '../middleware/auth'
import type { Bindings, Variables } from '../types'
import * as schemas from './auth.schema'
import * as handlers from '../handlers/auth.handler'

const app = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

app.use('/success', checkJwt)
app.use('/success', injectUser)

// --- Routing ---

export const auth = app
  .openapi(schemas.loginRoute, handlers.loginHandler)
  .openapi(schemas.googleAuthRoute, handlers.googleAuthHandler)
  .openapi(schemas.googleCallbackRoute, handlers.googleCallbackHandler)
  .openapi(schemas.successRoute, handlers.successHandler)
  .openapi(schemas.logoutRoute, handlers.logoutHandler)
