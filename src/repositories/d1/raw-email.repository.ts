import { PARSE_STATUS, type ParseStatus } from '../../constants/status'
import type { RawEmailRepository, RawEmailRow } from '../types'

export const createD1RawEmailRepository = (db: D1Database): RawEmailRepository => {
  return {
    async findById(userId: string, id: string): Promise<RawEmailRow | null> {
      return await db
        .prepare(`SELECT * FROM raw_emails WHERE user_id = ? AND id = ?`)
        .bind(userId, id)
        .first<RawEmailRow>()
    },

    async findLatestReceivedAt(userId: string): Promise<number | null> {
      const result = await db
        .prepare(`SELECT max(received_at) as latest_received_at FROM raw_emails WHERE user_id = ?`)
        .bind(userId)
        .first<{ latest_received_at: number | null }>()
      return result?.latest_received_at ?? null
    },

    async deleteLatest(userId: string, limit: number): Promise<number> {
      if (!userId) {
        throw new Error('deleteLatest: userId is required')
      }

      // 最新の N 件の ID を取得
      const { results: emailsToDelete } = await db
        .prepare(
          `SELECT id FROM raw_emails WHERE user_id = ? ORDER BY received_at DESC, fetched_at DESC LIMIT ?`,
        )
        .bind(userId, limit)
        .all<{ id: string }>()

      if (emailsToDelete.length === 0) return 0

      const ids = emailsToDelete.map((e) => e.id)
      const placeholders = ids.map(() => '?').join(',')

      // 関連データをまとめて削除 (D1.batch を使用)
      await db.batch([
        db
          .prepare(`DELETE FROM bookings WHERE user_id = ? AND raw_mail_id IN (${placeholders})`)
          .bind(userId, ...ids),
        db
          .prepare(`DELETE FROM sync_logs WHERE user_id = ? AND raw_mail_id IN (${placeholders})`)
          .bind(userId, ...ids),
        db
          .prepare(`DELETE FROM raw_emails WHERE user_id = ? AND id IN (${placeholders})`)
          .bind(userId, ...ids),
      ])

      return ids.length
    },

    async filterExistingIds(userId: string, ids: string[]): Promise<string[]> {
      if (ids.length === 0) return []

      const chunkSize = 100
      const results: string[] = []

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const placeholders = chunk.map(() => '?').join(',')

        const { results: chunkResults } = await db
          .prepare(`SELECT id FROM raw_emails WHERE user_id = ? AND id IN (${placeholders})`)
          .bind(userId, ...chunk)
          .all<{ id: string }>()

        if (chunkResults) {
          results.push(...chunkResults.map((r) => r.id))
        }
      }

      return results
    },

    async findPending(userId: string): Promise<RawEmailRow[]> {
      const { results } = await db
        .prepare(
          `SELECT * FROM raw_emails WHERE user_id = ? AND parse_status = ? ORDER BY received_at ASC`,
        )
        .bind(userId, PARSE_STATUS.PENDING)
        .all<RawEmailRow>()
      return results || []
    },

    async create(
      userId: string,
      email: Omit<RawEmailRow, 'user_id' | 'fetched_at'>,
    ): Promise<void> {
      await db
        .prepare(
          `INSERT INTO raw_emails (id, user_id, thread_id, subject, snippet, body, received_at, parse_status, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
        )
        .bind(
          email.id,
          userId,
          email.thread_id,
          email.subject,
          email.snippet,
          email.body,
          email.received_at,
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
        INSERT INTO raw_emails (id, user_id, thread_id, subject, snippet, body, received_at, parse_status, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `)

      const batch = emails.map((email) =>
        stmt.bind(
          email.id,
          userId,
          email.thread_id,
          email.subject,
          email.snippet,
          email.body,
          email.received_at,
          email.parse_status,
        ),
      )

      await db.batch(batch)
    },

    async updateParseStatus(userId: string, id: string, status: ParseStatus): Promise<void> {
      await db
        .prepare(`UPDATE raw_emails SET parse_status = ? WHERE user_id = ? AND id = ?`)
        .bind(status, userId, id)
        .run()
    },

    async batchUpdateParseStatus(
      userId: string,
      updates: { id: string; status: ParseStatus }[],
    ): Promise<void> {
      if (updates.length === 0) return

      const stmt = db.prepare(`UPDATE raw_emails SET parse_status = ? WHERE user_id = ? AND id = ?`)
      const batch = updates.map((u) => stmt.bind(u.status, userId, u.id))

      await db.batch(batch)
    },

    async deleteAll(userId: string): Promise<void> {
      await db.batch([
        db.prepare(`DELETE FROM bookings WHERE user_id = ?`).bind(userId),
        db.prepare(`DELETE FROM sync_logs WHERE user_id = ?`).bind(userId),
        db.prepare(`DELETE FROM raw_emails WHERE user_id = ?`).bind(userId),
      ])
    },
  }
}
