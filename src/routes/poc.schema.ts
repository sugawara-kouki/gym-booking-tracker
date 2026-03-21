import { createRoute, z } from '@hono/zod-openapi'
import { ErrorResponseSchema } from '../utils/error'

// --- Schemas ---

export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    message: z.string().optional(),
    data: dataSchema.optional()
  })

export const GmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
})

export const EmailListResponseSchema = z.object({
  messages: z.array(GmailMessageSchema),
  nextPageToken: z.string().optional()
})

export const BookingSchema = z.object({
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

export const IngestResultSchema = z.object({
  count: z.number()
})

export const ProcessPendingResultSchema = z.object({
  successCount: z.number(),
  errorCount: z.number(),
  runId: z.string()
})

export const FullSyncResultSchema = z.object({
  runId: z.string(),
  success: z.boolean()
})

// --- Routes configuration ---

export const emailsRoute = createRoute({
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

export const dbClearRoute = createRoute({
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

export const dbTestRoute = createRoute({
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

export const ingestRoute = createRoute({
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

export const parsePendingRoute = createRoute({
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

export const syncRoute = createRoute({
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
