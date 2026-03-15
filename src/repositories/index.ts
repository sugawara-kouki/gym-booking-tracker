import { D1BookingRepository } from './d1/booking.repository';
import { D1RawEmailRepository } from './d1/raw-email.repository';
import { D1SyncLogRepository } from './d1/sync-log.repository';
import { D1SyncRunRepository } from './d1/sync-run.repository';

export interface Repositories {
    bookings: D1BookingRepository;
    rawEmails: D1RawEmailRepository;
    syncLogs: D1SyncLogRepository;
    syncRuns: D1SyncRunRepository;
}

export function createRepositories(db: D1Database): Repositories {
    return {
        bookings: new D1BookingRepository(db),
        rawEmails: new D1RawEmailRepository(db),
        syncLogs: new D1SyncLogRepository(db),
        syncRuns: new D1SyncRunRepository(db),
    };
}
