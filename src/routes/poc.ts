import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { SyncOrchestrator, SYNC_RUN_STATUS } from '../services/sync-orchestrator'
import { createRepositories } from '../repositories'
import { injectUser, checkJwt } from '../middleware/auth'
import { injectGmail } from '../middleware/gmail'
import { ErrorResponseSchema } from '../utils/error'
import type { Bindings, Variables } from '../types'

export const poc = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

// POCルート全体に適用するミドルウェア
poc.use('*', checkJwt)
poc.use('*', injectUser)
poc.use('*', injectGmail)

// --- Schemas ---


const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    message: z.string().optional(),
    data: dataSchema.optional()
  })

const GmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
})

const EmailListResponseSchema = z.object({
  messages: z.array(GmailMessageSchema),
  nextPageToken: z.string().optional()
})

const BookingSchema = z.object({
  id: z.string(),
  facility_name: z.string(),
  event_date: z.string(),
  event_end_date: z.string().nullable(),
  registration_number: z.string().nullable(),
  purpose: z.string().nullable(),
  status: z.string(),
  raw_mail_id: z.string(),
  created_at: z.string().optional(),
})

const IngestResultSchema = z.object({
  count: z.number()
})

const ProcessPendingResultSchema = z.object({
  successCount: z.number(),
  errorCount: z.number(),
  runId: z.string()
})

const FullSyncResultSchema = z.object({
  runId: z.string(),
  success: z.boolean()
})


// --- Routes configuration ---

const emailsRoute = createRoute({
  method: 'get',
  path: '/emails',
  summary: 'Fetch recent emails',
  description: 'PoC: Gmailからメール一覧を取得して返すテストエンドポイント',
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(EmailListResponseSchema) } },
      description: 'List of emails'
    },
    401: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Unauthorized'
    },
    500: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Server error'
    }
  },
  security: [{ cookieAuth: [] }]
})

const dbClearRoute = createRoute({
  method: 'get',
  path: '/db-clear',
  summary: 'Clear database',
  description: 'PoC: データベースの全データをクリア',
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(z.object({})) } },
      description: 'Data cleared successfully'
    },
    500: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
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
      content: { 'application/json': { schema: SuccessResponseSchema(z.array(BookingSchema)) } },
      description: 'Connection successful'
    },
    500: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
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
      content: { 'application/json': { schema: SuccessResponseSchema(IngestResultSchema) } },
      description: 'Ingest completed'
    },
    500: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
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
      content: { 'application/json': { schema: SuccessResponseSchema(ProcessPendingResultSchema) } },
      description: 'Processing completed'
    },
    500: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
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
      content: { 'application/json': { schema: SuccessResponseSchema(FullSyncResultSchema) } },
      description: 'Sync completed'
    },
    500: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Server error'
    }
  }
})

// --- Handlers ---

poc.openapi(emailsRoute, async (c) => {
  const gmail = c.get('gmail')
  const messages = await gmail.listMessages(5)

  return c.json({
    success: true as const,
    data: messages
  }, 200)
})

poc.openapi(dbClearRoute, async (c) => {
  const repos = createRepositories(c.env.gym_booking_db)
  
  // 外部キー制約を考慮した順序、または一度オフにして削除
  // 直列で削除を実行するように変更 (以前のbatch相当)
  await repos.syncLogs.deleteAll()
  await repos.syncRuns.deleteAll()
  await repos.bookings.deleteAll()
  await repos.rawEmails.deleteAll()

  return c.json({
    success: true as const,
    message: 'All data cleared successfully',
    data: {}
  }, 200)
})

poc.openapi(dbTestRoute, async (c) => {
  const repos = createRepositories(c.env.gym_booking_db)
  const results = await repos.bookings.findAll()

  return c.json({
    success: true as const,
    message: 'D1 Connection Successful',
    data: results
  }, 200)
})

poc.openapi(ingestRoute, async (c) => {
  const orchestrator = new SyncOrchestrator(c.env)
  const result = await orchestrator.ingest(500)

  return c.json({
    success: true as const,
    message: 'Ingest completed',
    data: result
  }, 200)
})

poc.openapi(parsePendingRoute, async (c) => {
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
})

poc.openapi(syncRoute, async (c) => {
  const orchestrator = new SyncOrchestrator(c.env)
  const result = await orchestrator.sync()

  return c.json({
    success: true as const,
    message: 'Sync completed (Ingest + Process)',
    data: result
  }, 200)
})
