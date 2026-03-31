import type { SyncRunRepository, SyncRunRow, SyncRunStatus } from '../types'

export class D1SyncRunRepository implements SyncRunRepository {
  constructor(private readonly db: D1Database) {}

  async create(userId: string, runId: string): Promise<void> {
    await this.db
      .prepare(`
            INSERT INTO sync_runs (id, user_id, status, total_count, success_count, error_count)
            VALUES (?, ?, ?, 0, 0, 0)
        `)
      .bind(runId, userId, 'running')
      .run()
  }

  async findById(userId: string, runId: string): Promise<SyncRunRow | null> {
    return await this.db
      .prepare('SELECT * FROM sync_runs WHERE user_id = ? AND id = ?')
      .bind(userId, runId)
      .first<SyncRunRow>()
  }

  async findLastSuccess(userId: string): Promise<SyncRunRow | null> {
    return await this.db
      .prepare(`
            SELECT * FROM sync_runs 
            WHERE user_id = ? AND status = ? 
            ORDER BY executed_at DESC LIMIT 1
        `)
      .bind(userId, 'success')
      .first<SyncRunRow>()
  }

  async updateTotalCount(userId: string, runId: string, totalCount: number): Promise<void> {
    await this.db
      .prepare('UPDATE sync_runs SET total_count = ? WHERE user_id = ? AND id = ?')
      .bind(totalCount, userId, runId)
      .run()
  }

  async finalize(
    userId: string,
    runId: string,
    status: SyncRunStatus,
    successCount: number,
    errorCount: number,
  ): Promise<void> {
    await this.db
      .prepare(`
            UPDATE sync_runs 
            SET status = ?, success_count = ?, error_count = ?, executed_at = unixepoch()
            WHERE user_id = ? AND id = ?
        `)
      .bind(status, successCount, errorCount, userId, runId)
      .run()
  }

  async deleteAll(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM sync_runs WHERE user_id = ?').bind(userId).run()
  }
}
