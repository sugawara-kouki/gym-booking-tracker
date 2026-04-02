import * as handlers from '../handlers/auth.handler'
import { createAPIBaseRouter, createAuthRouter } from '../utils/router'
import * as schemas from './auth.schema'

const app = createAPIBaseRouter()

// --- Routing ---

export const auth = app
  .openapi(schemas.loginRoute, handlers.loginHandler)
  .openapi(schemas.googleAuthRoute, handlers.googleAuthHandler)
  .openapi(schemas.googleCallbackRoute, handlers.googleCallbackHandler)
  .openapi(schemas.logoutRoute, handlers.logoutHandler)

// 認証が必要なルートのみ、型昇格したサブルーターに切り出す
const protectedAuth = createAuthRouter()
protectedAuth.openapi(schemas.successRoute, handlers.successHandler)

auth.route('/', protectedAuth)
