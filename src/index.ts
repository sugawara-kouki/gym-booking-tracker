import { app } from './app'
import { SyncOrchestrator } from './services/sync-orchestrator'
import type { Bindings } from './types'

/**
 * Cloudflare Workers Entry Point
 */
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log(`[Scheduled] Job started: ${event.cron}`);
    const orchestrator = new SyncOrchestrator(env);
    const result = await orchestrator.sync();
    console.log(`[Scheduled] Job completed. Run ID: ${result.runId}, Success: ${result.success}`);
  }
}
