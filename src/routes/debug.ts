import { createRoute, z } from '@hono/zod-openapi'
import { createDebugHandler } from '../handlers/debug.handler'
import { createAuthRouter } from '../utils/router'

/**
 * デバッグ用 API ルーティング
 */
const debugHandler = createDebugHandler()

const clearLatestRoute = createRoute({
  method: 'post',
  path: '/clear-latest',
  request: {
    query: z.object({
      limit: z
        .string()
        .optional()
        .default('5')
        .openapi({ param: { name: 'limit', in: 'query' }, example: '5' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string(),
            deletedCount: z.number(),
          }),
        },
      },
      description: 'Successfully deleted the latest records.',
    },
    500: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            error: z.string(),
          }),
        },
      },
      description: 'Internal server error.',
    },
  },
  tags: ['Debug'],
  summary: '最新の解析済みメールデータを削除する',
  description:
    '最新の N 件のメールデータと、それに関連する予約・ログ情報を DB から一括削除します。',
})

export const debug = createAuthRouter().openapi(clearLatestRoute, (c) =>
  debugHandler.clearLatest(c),
)
