import { OpenAPIHono } from '@hono/zod-openapi'
import { getBookingsHandler } from '../handlers/bookings.handler'
import { type AuthenticatedVariables, authMiddleware } from '../middleware/auth'
import type { Bindings } from '../types'
import { getBookingsRoute } from './bookings.schema'

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthenticatedVariables }>()

app.use('*', authMiddleware)

export const bookings = app.openapi(getBookingsRoute, getBookingsHandler)
