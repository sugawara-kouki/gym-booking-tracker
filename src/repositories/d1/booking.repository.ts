import { BOOKING_STATUS } from '../../constants/status'
import type { BookingRepository, BookingRow } from '../types'

export const createD1BookingRepository = (db: D1Database): BookingRepository => {
  const UPSERT_SQL = `
    INSERT INTO bookings (
        id, user_id, facility_name, event_date, event_end_date, 
        registration_number, purpose, court_info, status, raw_mail_id, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, unixepoch())
    ON CONFLICT(user_id, raw_mail_id) DO UPDATE SET
        status = CASE 
            WHEN excluded.status = ?11 AND status IN (?12, ?13) THEN status
            ELSE excluded.status
        END,
        updated_at = unixepoch()
    ON CONFLICT(id) DO UPDATE SET
        status = CASE 
            WHEN excluded.status = ?11 AND status IN (?12, ?13) THEN status
            ELSE excluded.status
        END,
        updated_at = unixepoch()
  `

  return {
    async upsert(
      userId: string,
      booking: Omit<BookingRow, 'user_id' | 'updated_at'>,
    ): Promise<void> {
      await db
        .prepare(UPSERT_SQL)
        .bind(
          booking.id, // ?1
          userId, // ?2
          booking.facility_name, // ?3
          booking.event_date, // ?4
          booking.event_end_date, // ?5
          booking.registration_number, // ?6
          booking.purpose, // ?7
          booking.court_info, // ?8
          booking.status, // ?9
          booking.raw_mail_id, // ?10
          BOOKING_STATUS.APPLIED, // ?11
          BOOKING_STATUS.WON, // ?12
          BOOKING_STATUS.CONFIRMED, // ?13
        )
        .run()
    },

    async batchUpsert(
      userId: string,
      bookings: Omit<BookingRow, 'user_id' | 'updated_at'>[],
    ): Promise<void> {
      if (bookings.length === 0) return

      const stmt = db.prepare(UPSERT_SQL)
      const batch = bookings.map((booking) =>
        stmt.bind(
          booking.id, // ?1
          userId, // ?2
          booking.facility_name, // ?3
          booking.event_date, // ?4
          booking.event_end_date, // ?5
          booking.registration_number, // ?6
          booking.purpose, // ?7
          booking.court_info, // ?8
          booking.status, // ?9
          booking.raw_mail_id, // ?10
          BOOKING_STATUS.APPLIED, // ?11
          BOOKING_STATUS.WON, // ?12
          BOOKING_STATUS.CONFIRMED, // ?13
        ),
      )

      await db.batch(batch)
    },

    async findAll(userId: string): Promise<BookingRow[]> {
      const { results } = await db
        .prepare('SELECT * FROM bookings WHERE user_id = ?')
        .bind(userId)
        .all<BookingRow>()
      return results
    },

    async deleteAll(userId: string): Promise<void> {
      await db.prepare('DELETE FROM bookings WHERE user_id = ?').bind(userId).run()
    },
  }
}
