import { OpenAPIHono } from '@hono/zod-openapi'
import type { Bindings, Variables } from '../types'
import { getBookingsRoute } from './bookings.schema'
import { getBookingsHandler } from '../handlers/bookings.handler'

export const bookings = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

bookings.openapi(getBookingsRoute, getBookingsHandler)
