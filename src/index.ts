import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { SyncOrchestrator } from './services/sync-orchestrator'
import { poc } from './routes/poc'

export type Bindings = {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REFRESH_TOKEN: string
  gym_booking_db: D1Database
}

const app = new OpenAPIHono<{ Bindings: Bindings }>()

// 必要に応じてフロントエンド用のCORSを設定
app.use('*', cors({
  origin: '*', // Swagger UIは同一オリジンになるため、外部からのアクセス用に緩和まはた削除可能ですが、一旦'*'にしておきます
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

app.get('/', (c) => {
  return c.text('Gym Booking Tracker API')
})

app.route('/poc', poc)

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Gym Booking Tracker API',
  },
})

app.get('/swagger', swaggerUI({ url: '/doc' }))

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log(`[Scheduled] Job started: ${event.cron}`);
    const orchestrator = new SyncOrchestrator(env);
    const result = await orchestrator.sync();
    console.log(`[Scheduled] Job completed. Run ID: ${result.runId}, Success: ${result.success}`);
  }
}
