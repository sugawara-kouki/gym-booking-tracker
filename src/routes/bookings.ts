import { OpenAPIHono } from '@hono/zod-openapi'
import { checkJwt, injectUser } from '../middleware/auth'
import type { Bindings, Variables } from '../types'
import { getBookingsRoute } from './bookings.schema'
import { getBookingsHandler } from '../handlers/bookings.handler'

const app = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

app.use('*', checkJwt)
app.use('*', injectUser)

export const bookings = app
  .openapi(getBookingsRoute, getBookingsHandler)
