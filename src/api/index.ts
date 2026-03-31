import { OpenAPIHono } from '@hono/zod-openapi'
import { auth } from '../routes/auth'
import { bookings } from '../routes/bookings'
import { sync } from '../routes/sync'

const routes = new OpenAPIHono()
  .route('/sync', sync)
  .route('/bookings', bookings)
  .route('/auth', auth)

export type AppType = typeof routes
export { routes as apiApp }
