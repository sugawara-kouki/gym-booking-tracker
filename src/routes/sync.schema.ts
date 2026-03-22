import { createRoute, z } from '@hono/zod-openapi'
import { SuccessResponseSchema } from '../utils/response'
import { ErrorResponseSchema } from '../utils/error'

// --- Schemas ---

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

export const SyncStatusResultSchema = z.object({
  id: z.string(),
  status: z.string(),
  total_count: z.number(),
  success_count: z.number(),
  error_count: z.number()
})

// --- Routes configuration ---

export const resetDataRoute = createRoute({
  method: 'delete',
  path: '/data',
  summary: 'Reset user data',
  description: 'ユーザーの全データをクリア（同期ログや予約データ等）',
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

export const ingestRoute = createRoute({
  method: 'post',
  path: '/ingest',
  summary: 'Run ingest process (Debug)',
  description: '【デバッグ】Gmailからの取り込み（Ingest）のみを実行',
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
  method: 'post',
  path: '/parse-pending',
  summary: 'Process pending emails (Debug)',
  description: '【デバッグ】DB内の未処理メールの解析（Parse Pending）のみを実行',
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
  method: 'post',
  path: '/',
  summary: 'Run full sync process',
  description: '同期処理（取り込んだ最新メールから予約を解析）の開始 (非同期実行)',
  responses: {
    202: {
      content: { 'application/json': { schema: SuccessResponseSchema(FullSyncResultSchema) } },
      description: 'Sync job started in background'
    },
    500: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Server error'
    }
  }
})

export const syncStatusRoute = createRoute({
  method: 'get',
  path: '/{runId}/status',
  summary: 'Check sync status',
  description: 'バックグラウンド実行中の同期処理ステータスを取得',
  request: {
    params: z.object({
      runId: z.string().openapi({ description: 'The Run ID' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SuccessResponseSchema(SyncStatusResultSchema) } },
      description: 'Sync status'
    },
    404: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Run ID not found'
    },
    500: {
      content: { 'application/json': { schema: ErrorResponseSchema } },
      description: 'Server error'
    }
  }
})
