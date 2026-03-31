import { OpenAPIHono } from '@hono/zod-openapi'
import { checkJwt, injectUser } from '../middleware/auth'
import type { Bindings, Variables } from '../types'
import { getBookingsRoute } from './bookings.schema'
import { getBookingsHandler } from '../handlers/bookings.handler'

import { authMiddleware, type AuthenticatedVariables } from '../middleware/auth'

const app = new OpenAPIHono<{ Bindings: Bindings, Variables: AuthenticatedVariables }>()

app.use('*', authMiddleware)

export const bookings = app
  .openapi(getBookingsRoute, getBookingsHandler)
