import { createRoute, z } from '@hono/zod-openapi'
import { ErrorResponseSchema } from '../utils/error'
import { SuccessResponseSchema } from '../utils/response'

export const BookingSchema = z.object({
  id: z.string(),
  facility_name: z.string(),
  event_date: z.string(),
  event_end_date: z.string().nullable(),
  registration_number: z.string().nullable(),
  purpose: z.string().nullable(),
  status: z.string(),
  raw_mail_id: z.string(),
  created_at: z.string().optional(),
})

export const getBookingsRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'Get user bookings',
  description: 'ユーザーの予約一覧を取得',
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(z.array(BookingSchema)) } },
      description: 'Bookings retrieved successfully',
    },
    500: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Server error',
    },
  },
})
