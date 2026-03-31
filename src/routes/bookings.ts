import { OpenAPIHono } from '@hono/zod-openapi'
import { getBookingsHandler } from '../handlers/bookings.handler'
import {
  type AuthenticatedVariables,
  authMiddleware,
  checkJwt,
  injectUser,
} from '../middleware/auth'
import type { Bindings, Variables } from '../types'
import { getBookingsRoute } from './bookings.schema'

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthenticatedVariables }>()

app.use('*', authMiddleware)

export const bookings = app.openapi(getBookingsRoute, getBookingsHandler)
