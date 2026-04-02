import {
  ingestHandler,
  parsePendingHandler,
  resetDataHandler,
  syncHandler,
  syncStatusHandler,
} from '../handlers/sync.handler'
import { createAuthRouter, createGmailRouter } from '../utils/router'
import {
  ingestRoute,
  parsePendingRoute,
  resetDataRoute,
  syncRoute,
  syncStatusRoute,
} from './sync.schema'

/**
 * 認証済みユーザー向けのルーター定義。
 * createAuthRouter を使用することで、自動的に認証ミドルウェアが適用され、型が昇格します。
 */
const app = createAuthRouter()

// Gmail 不要なルート（ベースアプリに直接登録）
app.openapi(syncStatusRoute, syncStatusHandler)
app.openapi(resetDataRoute, resetDataHandler)

// Gmail 必要なルート（型昇格したサブルーターに登録）
// createGmailRouter を使用することで、Gmail 連携に必要なミドルウェアが自動適用されます。
const gmailApp = createGmailRouter()

gmailApp.openapi(syncRoute, syncHandler)
gmailApp.openapi(ingestRoute, ingestHandler)
gmailApp.openapi(parsePendingRoute, parsePendingHandler)

app.route('/', gmailApp)

export const sync = app
