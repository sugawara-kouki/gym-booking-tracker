import { SyncOrchestrator, SYNC_RUN_STATUS } from '../services/sync-orchestrator'
import type { AuthenticatedRouteHandler } from '../types'
import {
  resetDataRoute,
  ingestRoute,
  parsePendingRoute,
  syncRoute,
  syncStatusRoute
} from '../routes/sync.schema'

export const resetDataHandler: AuthenticatedRouteHandler<typeof resetDataRoute> = async (c) => {
  const repos = c.get('repos')
  const user = c.get('user')

  await repos.syncLogs.deleteAll(user.id)
  await repos.syncRuns.deleteAll(user.id)
  await repos.bookings.deleteAll(user.id)
  await repos.rawEmails.deleteAll(user.id)

  return c.json({
    success: true as const,
    message: 'Current user data cleared successfully',
    data: {}
  }, 200)
}

export const ingestHandler: AuthenticatedRouteHandler<typeof ingestRoute> = async (c) => {
  const user = c.get('user')
  const orchestrator = new SyncOrchestrator(c.env, user.id, c.get('gmail'))
  const result = await orchestrator.ingest(500)

  return c.json({
    success: true as const,
    message: 'Ingest completed',
    data: result
  }, 200)
}

export const parsePendingHandler: AuthenticatedRouteHandler<typeof parsePendingRoute> = async (c) => {
  const user = c.get('user')
  const orchestrator = new SyncOrchestrator(c.env, user.id, c.get('gmail'))
  const repos = c.get('repos')

  const runId = crypto.randomUUID()
  await repos.syncRuns.create(user.id, runId)
  const result = await orchestrator.processPending(runId)

  const finalStatus = result.errorCount === 0 ? SYNC_RUN_STATUS.SUCCESS : SYNC_RUN_STATUS.PARTIAL_SUCCESS
  await repos.syncRuns.finalize(user.id, runId, finalStatus, result.successCount, result.errorCount)

  return c.json({
    success: true as const,
    message: 'Processing completed',
    data: { ...result, runId }
  }, 200)
}

export const syncHandler: AuthenticatedRouteHandler<typeof syncRoute> = async (c) => {
  const user = c.get('user')
  const orchestrator = new SyncOrchestrator(c.env, user.id, c.get('gmail'))
  
  const runId = crypto.randomUUID()
  
  c.executionCtx.waitUntil(
    orchestrator.sync(runId).catch((err) => {
      console.error(`Background sync failed for runId: ${runId}`, err)
    })
  )

  return c.json({
    success: true as const,
    message: 'Sync job started in background',
    data: { runId, success: true }
  }, 202)
}

export const syncStatusHandler: AuthenticatedRouteHandler<typeof syncStatusRoute> = async (c) => {
  const user = c.get('user')
  const repos = c.get('repos')
  const { runId } = c.req.valid('param')

  const syncRun = await repos.syncRuns.findById(user.id, runId)
  
  if (!syncRun) {
    return c.json({
      success: false as const,
      error: {
        code: 'NOT_FOUND',
        message: 'Sync run ID not found'
      }
    }, 404)
  }

  return c.json({
    success: true as const,
    message: 'Status fetched successfully',
    data: {
      id: syncRun.id,
      status: syncRun.status,
      total_count: syncRun.total_count,
      success_count: syncRun.success_count,
      error_count: syncRun.error_count
    }
  }, 200)
}
