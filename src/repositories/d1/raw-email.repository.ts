import type { ParseStatus } from '../../services/sync-orchestrator'
import type { RawEmailRepository, RawEmailRow } from '../types'

export const createD1RawEmailRepository = (db: D1Database): RawEmailRepository => {
  return {
    async findById(userId: string, id: string): Promise<RawEmailRow | null> {
      return await db
        .prepare('SELECT * FROM raw_emails WHERE user_id = ? AND id = ?')
        .bind(userId, id)
        .first<RawEmailRow>()
    },

    async create(
      userId: string,
      email: Omit<RawEmailRow, 'user_id' | 'fetched_at'>,
    ): Promise<void> {
      await db
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
    },

    async batchCreate(
      userId: string,
      emails: Omit<RawEmailRow, 'user_id' | 'fetched_at'>[],
    ): Promise<void> {
      if (emails.length === 0) return

      const stmt = db.prepare(`
        INSERT INTO raw_emails (id, user_id, thread_id, subject, snippet, body, fetched_at, parse_status)
        VALUES (?, ?, ?, ?, ?, ?, unixepoch(), ?)
      `)

      const batch = emails.map((email) =>
        stmt.bind(
          email.id,
          userId,
          email.thread_id,
          email.subject,
          email.snippet,
          email.body,
          email.parse_status,
        ),
      )

      await db.batch(batch)
    },

    async updateParseStatus(userId: string, id: string, status: ParseStatus): Promise<void> {
      await db
        .prepare('UPDATE raw_emails SET parse_status = ? WHERE user_id = ? AND id = ?')
        .bind(status, userId, id)
        .run()
    },

    async batchUpdateParseStatus(
      userId: string,
      updates: { id: string; status: ParseStatus }[],
    ): Promise<void> {
      if (updates.length === 0) return

      const stmt = db.prepare('UPDATE raw_emails SET parse_status = ? WHERE user_id = ? AND id = ?')
      const batch = updates.map((u) => stmt.bind(u.status, userId, u.id))

      await db.batch(batch)
    },

    async findPending(userId: string): Promise<RawEmailRow[]> {
      const { results } = await db
        .prepare(
          'SELECT * FROM raw_emails WHERE user_id = ? AND parse_status IN (?, ?) ORDER BY fetched_at ASC',
        )
        .bind(userId, 'pending', 'fail')
        .all<RawEmailRow>()
      return results
    },

    async deleteAll(userId: string): Promise<void> {
      await db.prepare('DELETE FROM raw_emails WHERE user_id = ?').bind(userId).run()
    },
  }
}
