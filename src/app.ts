import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { poc } from './routes/poc'
import { auth } from './routes/auth'
import type { Bindings, Variables } from './types'

export const app = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

// グローバルミドルウェアの設定
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
  },
})

app.get('/swagger', swaggerUI({ url: '/doc' }))
