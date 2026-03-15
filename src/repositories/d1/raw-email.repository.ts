import { RawEmailRepository, RawEmailRow } from '../types';
import { ParseStatus } from '../../services/sync-orchestrator';

export class D1RawEmailRepository implements RawEmailRepository {
    constructor(private readonly db: D1Database) {}

    async findById(id: string): Promise<RawEmailRow | null> {
        const result = await this.db.prepare('SELECT * FROM raw_emails WHERE id = ?').bind(id).first<RawEmailRow>();
        return result;
    }

    async create(email: Omit<RawEmailRow, 'fetched_at'>): Promise<void> {
        await this.db.prepare(`
            INSERT INTO raw_emails (id, thread_id, subject, snippet, body, fetched_at, parse_status)
            VALUES (?, ?, ?, ?, ?, unixepoch(), ?)
        `).bind(
            email.id,
            email.thread_id,
            email.subject,
            email.snippet,
            email.body,
            email.parse_status
        ).run();
    }

    async updateParseStatus(id: string, status: ParseStatus): Promise<void> {
        await this.db.prepare("UPDATE raw_emails SET parse_status = ? WHERE id = ?")
            .bind(status, id).run();
    }

    async findPending(): Promise<RawEmailRow[]> {
        const { results } = await this.db.prepare("SELECT * FROM raw_emails WHERE parse_status IN (?, ?) ORDER BY fetched_at ASC")
            .bind('pending', 'fail')
            .all<RawEmailRow>();
        return results;
    }

    async deleteAll(): Promise<void> {
        await this.db.prepare('DELETE FROM raw_emails').run();
    }
}
