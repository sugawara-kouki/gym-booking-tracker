import { SyncRunRepository, SyncRunStatus } from '../types';

export class D1SyncRunRepository implements SyncRunRepository {
    constructor(private readonly db: D1Database) {}

    async create(runId: string): Promise<void> {
        await this.db.prepare(`
            INSERT INTO sync_runs (id, status, total_count, success_count, error_count)
            VALUES (?, ?, 0, 0, 0)
        `).bind(runId, 'running').run();
    }

    async updateTotalCount(runId: string, totalCount: number): Promise<void> {
        await this.db.prepare('UPDATE sync_runs SET total_count = ? WHERE id = ?')
            .bind(totalCount, runId).run();
    }

    async finalize(runId: string, status: SyncRunStatus, successCount: number, errorCount: number): Promise<void> {
        await this.db.prepare(`
            UPDATE sync_runs 
            SET status = ?, success_count = ?, error_count = ?, executed_at = unixepoch()
            WHERE id = ?
        `).bind(status, successCount, errorCount, runId).run();
    }

    async deleteAll(): Promise<void> {
        await this.db.prepare('DELETE FROM sync_runs').run();
    }
}
