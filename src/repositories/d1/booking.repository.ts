import { BookingRepository, BookingRow } from '../types';
import { BOOKING_STATUS } from '../../services/parser';

export class D1BookingRepository implements BookingRepository {
    constructor(private readonly db: D1Database) {}

    async upsert(booking: Omit<BookingRow, 'updated_at'>): Promise<void> {
        await this.db.prepare(`
            INSERT INTO bookings (
                id, facility_name, event_date, event_end_date, 
                registration_number, purpose, status, raw_mail_id, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, unixepoch())
            ON CONFLICT(raw_mail_id) DO UPDATE SET
                status = CASE 
                    WHEN excluded.status = ?9 AND status IN (?10, ?11) THEN status
                    ELSE excluded.status
                END,
                updated_at = unixepoch()
            ON CONFLICT(id) DO UPDATE SET
                status = CASE 
                    WHEN excluded.status = ?9 AND status IN (?10, ?11) THEN status
                    ELSE excluded.status
                END,
                updated_at = unixepoch()
        `).bind(
            booking.id,                     // ?1
            booking.facility_name,          // ?2
            booking.event_date,              // ?3
            booking.event_end_date,         // ?4
            booking.registration_number,    // ?5
            booking.purpose,                // ?6
            booking.status,                 // ?7
            booking.raw_mail_id,            // ?8
            BOOKING_STATUS.APPLIED,         // ?9
            BOOKING_STATUS.WON,             // ?10
            BOOKING_STATUS.CONFIRMED        // ?11
        ).run();
    }

    async findAll(): Promise<BookingRow[]> {
        const { results } = await this.db.prepare('SELECT * FROM bookings').all<BookingRow>();
        return results;
    }

    async deleteAll(): Promise<void> {
        await this.db.prepare('DELETE FROM bookings').run();
    }
}
