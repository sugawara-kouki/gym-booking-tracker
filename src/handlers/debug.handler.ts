import type { AuthenticatedContext } from '../middleware/auth'
import { Logger } from '../utils/logger'

/**
 * デバッグ用ハンドラー: 最新のデータを削除し、再取得をテストしやすくする
 */
export const createDebugHandler = () => {
  return {
    /**
     * 最新のメールデータ N 件を削除する
     * POST /api/debug/clear-latest?limit=5
     */
    async clearLatest(c: AuthenticatedContext) {
      const repos = c.get('repos')
      const user = c.get('user')
      const userId = user.id
      const limit = Number.parseInt(c.req.query('limit') || '5', 10)

      try {
        Logger.info(null, `Debug: Deleting latest ${limit} messages for user`, { userId })
        const deletedCount = await repos.rawEmails.deleteLatest(userId, limit)

        return c.json(
          {
            success: true,
            message: `Deleted ${deletedCount} raw emails and their associated data.`,
            deletedCount,
          },
          200,
        )
      } catch (err: unknown) {
        Logger.error(null, 'Failed to clear latest data in debug handler', { userId, error: err })
        return c.json({ success: false, error: 'Internal Server Error' }, 500)
      }
    },
  }
}
