import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { SyncOrchestrator } from './services/sync-orchestrator'
import { poc } from './routes/poc'

export type Bindings = {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REFRESH_TOKEN: string
  gym_booking_db: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// Swagger UI (localhost:8080) からのリクエストを許可するためのCORS設定
app.use('*', cors({
  origin: 'http://localhost:8080',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}))

app.get('/', (c) => {
  return c.text('Gym Booking Tracker API')
})

app.route('/poc', poc)

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log(`[Scheduled] Job started: ${event.cron}`);
    const orchestrator = new SyncOrchestrator(env);
    const result = await orchestrator.sync();
    console.log(`[Scheduled] Job completed. Run ID: ${result.runId}, Success: ${result.success}`);
  }
}
