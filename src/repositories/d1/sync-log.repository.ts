import { SyncLogRepository, SyncLogRow } from '../types';

export class D1SyncLogRepository implements SyncLogRepository {
    constructor(private readonly db: D1Database) {}

    async create(log: SyncLogRow): Promise<void> {
        await this.db.prepare(`
            INSERT INTO sync_logs (id, sync_run_id, raw_mail_id, status, error_detail)
            VALUES (?, ?, ?, ?, ?)
        `).bind(log.id, log.sync_run_id, log.raw_mail_id, log.status, log.error_detail).run();
    }

    async deleteAll(): Promise<void> {
        await this.db.prepare('DELETE FROM sync_logs').run();
    }
}
