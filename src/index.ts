import { app } from './app'
import { SyncOrchestrator } from './services/sync-orchestrator'
import type { Bindings } from './types'

/**
 * Cloudflare Workers Entry Point
 */
export default {
  fetch: app.fetch,
  /**
   * Cloudflare Workers の Cron Triggers による定時実行ハンドラー
   * 背景での自動同期処理（Gmail取り込み等）をここから開始します
   */
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log(`[Scheduled] Job started: ${event.cron}`);
    const orchestrator = new SyncOrchestrator(env);
    const result = await orchestrator.sync();
    console.log(`[Scheduled] Job completed. Run ID: ${result.runId}, Success: ${result.success}`);
  }
}
