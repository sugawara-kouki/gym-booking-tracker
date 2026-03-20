import { z } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/**
 * 共通のエラーレスポンススキーマ
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().openapi({ example: 'INTERNAL_SERVER_ERROR' }),
    message: z.string().openapi({ example: 'An unexpected error occurred' }),
  })
}).openapi('ErrorResponse')

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

/**
 * エラーコードの定数
 */
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const

export type ErrorCode = keyof typeof ERROR_CODES

/**
 * HTTPException をラップしたエラー生成関数
 * これを throw すると app.onError でキャッチされます
 */
export const createErrorResponse = (
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string
) => {
  const response = new Response(
    JSON.stringify({
      success: false,
      error: { code, message }
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' }
    }
  )
  return new HTTPException(status, { res: response })
}
