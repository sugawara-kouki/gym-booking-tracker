import { swaggerUI } from '@hono/swagger-ui'
import { OpenAPIHono } from '@hono/zod-openapi'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { apiApp } from './api'
import { errorHandler } from './handlers/error.handler'
import { Login } from './pages/Login'
import { renderer } from './renderer'
import type { Bindings, Variables } from './types'
import { Logger } from './utils/logger'

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

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
    latency: `${end - start}ms`,
  })
})

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }),
)

// --- UI サブルーター ---
const uiApp = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  .use('*', renderer)
  .get('/', (c) => c.text('Gym Booking Tracker'))
  .get('/login', (c) => {
    const baseUrl = new URL('/api', c.req.url).toString()
    return c.render(<Login baseUrl={baseUrl} />)
  })

// メインアプリへのマウント
app.route('/api', apiApp)
app.route('/', uiApp)

// グローバルエラーハンドリング
app.onError(errorHandler)

// OpenAPI / Swagger UI の設定
app.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'auth_token',
})

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Gym Booking Tracker API',
    description:
      'ジムの予約メールを自動解析し、Googleカレンダー等と連携するためのバックエンドAPIです。',
  },
})

app.get('/swagger', swaggerUI({ url: '/doc' }))

export default app
