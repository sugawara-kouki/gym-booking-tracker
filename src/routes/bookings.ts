import { OpenAPIHono } from '@hono/zod-openapi'
import { checkJwt, injectUser } from '../middleware/auth'
import type { Bindings, Variables } from '../types'
import { getBookingsRoute } from './bookings.schema'
import { getBookingsHandler } from '../handlers/bookings.handler'

export const bookings = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

bookings.use('*', checkJwt)
bookings.use('*', injectUser)

bookings.openapi(getBookingsRoute, getBookingsHandler)
