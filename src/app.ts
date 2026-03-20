import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { poc } from './routes/poc'
import { auth } from './routes/auth'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { HTTPException } from 'hono/http-exception'
import { ERROR_CODES } from './utils/error'
import { Logger } from './utils/logger'
import type { Bindings, Variables } from './types'

export const app = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

// グローバルミドルウェアの設定
app.use('*', requestId())

// カスタム構造化ロガー
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  const end = Date.now()
  
  Logger.info(c, 'Request completed', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    latency: `${end - start}ms`
  })
})

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

app.get('/', (c) => {
  return c.text('Gym Booking Tracker API')
})

// ルートの登録
app.route('/poc', poc)
app.route('/auth', auth)

// グローバルエラーハンドリング
app.onError((err, c) => {
  Logger.error(c, 'Unhandled exception occurred', { error: err })

  // HTTPException の場合は、設定されているレスポンスをそのまま返すか、
  // なければステータスコードを尊重して整形して返す
  if (err instanceof HTTPException) {
    if (err.res) return err.res
    return c.json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: err.message
      }
    }, err.status)
  }

  // それ以外の予期せぬエラーは 500 固定
  return c.json({
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: err instanceof Error ? err.message : 'Internal Server Error'
    }
  }, 500)
})

// OpenAPI / Swagger UI の設定
app.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'auth_token'
})

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Gym Booking Tracker API',
    description: 'ジムの予約メールを自動解析し、Googleカレンダー等と連携するためのバックエンドAPIです。',
  },
})

app.get('/swagger', swaggerUI({ url: '/doc' }))
