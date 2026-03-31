import { z } from '@hono/zod-openapi'

export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    message: z.string().optional(),
    data: dataSchema.optional(),
  })
