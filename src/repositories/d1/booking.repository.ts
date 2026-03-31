import { BOOKING_STATUS } from '../../services/parser'
import type { BookingRepository, BookingRow } from '../types'

export class D1BookingRepository implements BookingRepository {
  constructor(private readonly db: D1Database) {}

  async upsert(userId: string, booking: Omit<BookingRow, 'user_id' | 'updated_at'>): Promise<void> {
    await this.db
      .prepare(`
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
        `)
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
  }

  async findAll(userId: string): Promise<BookingRow[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM bookings WHERE user_id = ?')
      .bind(userId)
      .all<BookingRow>()
    return results
  }

  async deleteAll(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM bookings WHERE user_id = ?').bind(userId).run()
  }
}
