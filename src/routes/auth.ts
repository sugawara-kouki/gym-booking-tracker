import { OpenAPIHono } from '@hono/zod-openapi'
import * as handlers from '../handlers/auth.handler'
import { type AuthenticatedVariables, checkJwt, injectUser } from '../middleware/auth'
import type { Bindings, Variables } from '../types'
import * as schemas from './auth.schema'

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

// --- Routing ---

export const auth = app
  .openapi(schemas.loginRoute, handlers.loginHandler)
  .openapi(schemas.googleAuthRoute, handlers.googleAuthHandler)
  .openapi(schemas.googleCallbackRoute, handlers.googleCallbackHandler)
  .openapi(schemas.logoutRoute, handlers.logoutHandler)

// 認証が必要なルートのみ、型昇格したサブルーターに切り出す
const protectedAuth = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthenticatedVariables }>()
protectedAuth.use('*', checkJwt)
protectedAuth.use('*', injectUser)
protectedAuth.openapi(schemas.successRoute, handlers.successHandler)

auth.route('/', protectedAuth)
