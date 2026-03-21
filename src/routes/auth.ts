import { OpenAPIHono } from '@hono/zod-openapi'
import { injectUser, checkJwt } from '../middleware/auth'
import type { Bindings, Variables } from '../types'
import * as schemas from './auth.schema'
import * as handlers from '../handlers/auth.handler'

export const auth = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

// 成功ページにはJWT認証とユーザー情報注入を適用
auth.use('/success', checkJwt)
auth.use('/success', injectUser)

// --- Routing ---

auth.openapi(schemas.loginRoute, handlers.loginHandler)
auth.openapi(schemas.googleAuthRoute, handlers.googleAuthHandler)
auth.openapi(schemas.googleCallbackRoute, handlers.googleCallbackHandler)
auth.openapi(schemas.successRoute, handlers.successHandler)
auth.openapi(schemas.logoutRoute, handlers.logoutHandler)
