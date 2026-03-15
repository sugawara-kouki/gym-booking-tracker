import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { GmailService } from '../services/gmail'
import { SyncOrchestrator, SYNC_RUN_STATUS } from '../services/sync-orchestrator'
import { createRepositories } from '../repositories'
import type { Bindings } from '../index'

export const poc = new OpenAPIHono<{ Bindings: Bindings }>()

// --- Schemas ---
const ErrorSchema = z.object({
  success: z.literal(false),
  error: z.string()
}).openapi('ErrorResponse')

const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    message: z.string().optional(),
    data: dataSchema.optional()
  })

// --- Routes configuration ---

const emailsRoute = createRoute({
  method: 'get',
  path: '/emails',
  summary: 'Fetch recent emails',
  description: 'PoC: Gmailからメール一覧を取得して返すテストエンドポイント',
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
      description: 'List of emails'
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Server error'
    }
  }
})

const dbClearRoute = createRoute({
  method: 'get',
  path: '/db-clear',
  summary: 'Clear database',
  description: 'PoC: データベースの全データをクリア',
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
      description: 'Data cleared successfully'
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Server error'
    }
  }
})

const dbTestRoute = createRoute({
  method: 'get',
  path: '/db-test',
  summary: 'Test database connection',
  description: 'PoC: D1 データベースへの接続テスト',
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
      description: 'Connection successful'
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Server error'
    }
  }
})

const ingestRoute = createRoute({
  method: 'get',
  path: '/ingest',
  summary: 'Run ingest process',
  description: 'PoC: Gmailからの取り込み（Ingest）のみを実行',
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
      description: 'Ingest completed'
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Server error'
    }
  }
})

const parsePendingRoute = createRoute({
  method: 'get',
  path: '/parse-pending',
  summary: 'Process pending emails',
  description: 'PoC: DB内の未処理メールの解析（Parse Pending）のみを実行',
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
      description: 'Processing completed'
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Server error'
    }
  }
})

const syncRoute = createRoute({
  method: 'get',
  path: '/sync',
  summary: 'Run full sync process',
  description: 'PoC: 同期処理（SyncOrchestrator）の実行テスト',
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(z.any()) } },
      description: 'Sync completed'
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Server error'
    }
  }
})

// --- Handlers ---

poc.openapi(emailsRoute, async (c) => {
  try {
    const gmail = new GmailService(c.env)
    const messages = await gmail.listMessages(5)

    return c.json({
      success: true as const,
      data: messages
    }, 200)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false as const,
      error: errorMessage
    }, 500)
  }
})

poc.openapi(dbClearRoute, async (c) => {
  try {
    const repos = createRepositories(c.env.gym_booking_db)
    
    // 外部キー制約を考慮した順序、または一度オフにして削除
    // 直列で削除を実行するように変更 (以前のbatch相当)
    await repos.syncLogs.deleteAll()
    await repos.syncRuns.deleteAll()
    await repos.bookings.deleteAll()
    await repos.rawEmails.deleteAll()

    return c.json({
      success: true as const,
      message: 'All data cleared successfully'
    }, 200)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false as const,
      error: errorMessage
    }, 500)
  }
})

poc.openapi(dbTestRoute, async (c) => {
  try {
    const repos = createRepositories(c.env.gym_booking_db)
    const results = await repos.bookings.findAll()

    return c.json({
      success: true as const,
      message: 'D1 Connection Successful',
      data: results
    }, 200)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false as const,
      error: errorMessage
    }, 500)
  }
})

poc.openapi(ingestRoute, async (c) => {
  try {
    const orchestrator = new SyncOrchestrator(c.env)
    const result = await orchestrator.ingest(500)

    return c.json({
      success: true as const,
      message: 'Ingest completed',
      data: result
    }, 200)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false as const,
      error: errorMessage
    }, 500)
  }
})

poc.openapi(parsePendingRoute, async (c) => {
  try {
    const orchestrator = new SyncOrchestrator(c.env)
    const repos = createRepositories(c.env.gym_booking_db)
    const runId = crypto.randomUUID()

    await repos.syncRuns.create(runId)

    const result = await orchestrator.processPending(runId)

    const finalStatus = result.errorCount === 0 ? SYNC_RUN_STATUS.SUCCESS : SYNC_RUN_STATUS.PARTIAL_SUCCESS
    await repos.syncRuns.finalize(runId, finalStatus, result.successCount, result.errorCount)

    return c.json({
      success: true as const,
      message: 'Processing completed',
      data: { ...result, runId }
    }, 200)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false as const,
      error: errorMessage
    }, 500)
  }
})

poc.openapi(syncRoute, async (c) => {
  try {
    const orchestrator = new SyncOrchestrator(c.env)
    const result = await orchestrator.sync()

    return c.json({
      success: true as const,
      message: 'Sync completed (Ingest + Process)',
      data: result
    }, 200)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(error)
    return c.json({
      success: false as const,
      error: errorMessage
    }, 500)
  }
})
