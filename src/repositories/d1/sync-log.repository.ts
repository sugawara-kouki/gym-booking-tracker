import type { SyncLogRepository, SyncLogRow } from '../types'

export const createD1SyncLogRepository = (db: D1Database): SyncLogRepository => {
  return {
    async create(userId: string, log: Omit<SyncLogRow, 'user_id'>): Promise<void> {
      await db
        .prepare(`
              INSERT INTO sync_logs (id, user_id, sync_run_id, raw_mail_id, status, error_detail)
              VALUES (?, ?, ?, ?, ?, ?)
          `)
        .bind(log.id, userId, log.sync_run_id, log.raw_mail_id, log.status, log.error_detail)
        .run()
    },

    async batchCreate(userId: string, logs: Omit<SyncLogRow, 'user_id'>[]): Promise<void> {
      if (logs.length === 0) return

      const stmt = db.prepare(`
        INSERT INTO sync_logs (id, user_id, sync_run_id, raw_mail_id, status, error_detail)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      const batch = logs.map((log) =>
        stmt.bind(log.id, userId, log.sync_run_id, log.raw_mail_id, log.status, log.error_detail),
      )

      await db.batch(batch)
    },

    async deleteAll(userId: string): Promise<void> {
      await db.prepare('DELETE FROM sync_logs WHERE user_id = ?').bind(userId).run()
    },
  }
}
