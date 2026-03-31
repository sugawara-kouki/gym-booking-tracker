import type { getBookingsRoute } from '../routes/bookings.schema'
import type { AuthenticatedRouteHandler } from '../types'

export const getBookingsHandler: AuthenticatedRouteHandler<typeof getBookingsRoute> = async (c) => {
  const repos = c.get('repos')
  const user = c.get('user')
  const results = await repos.bookings.findAll(user.id)

  return c.json(
    {
      success: true as const,
      message: 'Data successfully retrieved',
      data: results,
    },
    200,
  )
}
