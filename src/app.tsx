import { swaggerUI } from '@hono/swagger-ui'
import { Hono } from 'hono'
import { apiApp } from './api'
import { Login } from './pages/Login'
import { renderer } from './renderer'
import type { Bindings, Variables } from './types'
import { createGlobalRouter } from './utils/router'

const app = createGlobalRouter()

// --- UI サブルーター ---
const uiApp = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  .use('*', renderer)
  .get('/', (c) => c.text('Gym Booking Tracker'))
  .get('/login', (c) => {
    const baseUrl = new URL('/api', c.req.url).toString()
    return c.render(<Login baseUrl={baseUrl} />)
  })

/**
 * /api 配下には api をマウント
 * ルート配下には ui をマウント
 */
app.route('/api', apiApp)
app.route('/', uiApp)

/**
 * OpenAPI / Swagger UI の設定
 */
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
