import type { ParseStatus } from '../../services/sync-orchestrator'
import type { RawEmailRepository, RawEmailRow } from '../types'

export class D1RawEmailRepository implements RawEmailRepository {
  constructor(private readonly db: D1Database) {}

  async findById(userId: string, id: string): Promise<RawEmailRow | null> {
    const result = await this.db
      .prepare('SELECT * FROM raw_emails WHERE user_id = ? AND id = ?')
      .bind(userId, id)
      .first<RawEmailRow>()
    return result
  }

  async create(userId: string, email: Omit<RawEmailRow, 'user_id' | 'fetched_at'>): Promise<void> {
    await this.db
      .prepare(`
            INSERT INTO raw_emails (id, user_id, thread_id, subject, snippet, body, fetched_at, parse_status)
            VALUES (?, ?, ?, ?, ?, ?, unixepoch(), ?)
        `)
      .bind(
        email.id,
        userId,
        email.thread_id,
        email.subject,
        email.snippet,
        email.body,
        email.parse_status,
      )
      .run()
  }

  async updateParseStatus(userId: string, id: string, status: ParseStatus): Promise<void> {
    await this.db
      .prepare('UPDATE raw_emails SET parse_status = ? WHERE user_id = ? AND id = ?')
      .bind(status, userId, id)
      .run()
  }

  async findPending(userId: string): Promise<RawEmailRow[]> {
    const { results } = await this.db
      .prepare(
        'SELECT * FROM raw_emails WHERE user_id = ? AND parse_status IN (?, ?) ORDER BY fetched_at ASC',
      )
      .bind(userId, 'pending', 'fail')
      .all<RawEmailRow>()
    return results
  }

  async deleteAll(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM raw_emails WHERE user_id = ?').bind(userId).run()
  }
}
