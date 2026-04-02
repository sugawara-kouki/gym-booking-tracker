import { errorHandler } from '../handlers/error.handler'
import { auth } from '../routes/auth'
import { bookings } from '../routes/bookings'
import { sync } from '../routes/sync'
import { createAPIBaseRouter } from '../utils/router'

/**
 * API 全体のルートを定義するルーター。
 * createRouter を使用することで、Bindings/Variables の型情報が引き継がれ、
 * injectRepos などの共通ミドルウェアも適用されます。
 */
const routes = createAPIBaseRouter()
  .route('/sync', sync)
  .route('/bookings', bookings)
  .route('/auth', auth)

/**
 * API 配下専用のエラーハンドリング。
 * これにより、API 内部で発生したエラーのみが JSON 形式で返されるようになります。
 */
routes.onError(errorHandler)

export type AppType = typeof routes
export { routes as apiApp }
