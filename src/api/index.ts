import { OpenAPIHono } from '@hono/zod-openapi'
import { sync } from '../routes/sync'
import { bookings } from '../routes/bookings'
import { auth } from '../routes/auth'

const routes = new OpenAPIHono()
  .route('/sync', sync)
  .route('/bookings', bookings)
  .route('/auth', auth)

export type AppType = typeof routes
export { routes as apiApp }
