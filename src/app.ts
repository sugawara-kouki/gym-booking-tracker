import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { poc } from './routes/poc'
import { auth } from './routes/auth'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { injectRepos } from './middleware/db'
import { errorHandler } from './handlers/error.handler'
import { Logger } from './utils/logger'
import type { Bindings, Variables } from './types'

export const app = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

// グローバルミドルウェアの設定
app.use('*', requestId())
app.use('*', injectRepos)

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
app.onError(errorHandler)

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
