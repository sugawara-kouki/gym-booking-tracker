import { getBookingsHandler } from '../handlers/bookings.handler'
import { createAuthRouter } from '../utils/router'
import { getBookingsRoute } from './bookings.schema'

const app = createAuthRouter()

export const bookings = app.openapi(getBookingsRoute, getBookingsHandler)
