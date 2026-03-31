import { createD1BookingRepository } from './d1/booking.repository'
import { createD1RawEmailRepository } from './d1/raw-email.repository'
import { createD1SyncLogRepository } from './d1/sync-log.repository'
import { createD1SyncRunRepository } from './d1/sync-run.repository'
import { createD1UserRepository } from './d1/user.repository'

export interface Repositories {
  bookings: ReturnType<typeof createD1BookingRepository>
  rawEmails: ReturnType<typeof createD1RawEmailRepository>
  syncLogs: ReturnType<typeof createD1SyncLogRepository>
  syncRuns: ReturnType<typeof createD1SyncRunRepository>
  users: ReturnType<typeof createD1UserRepository>
}

export function createRepositories(db: D1Database): Repositories {
  return {
    bookings: createD1BookingRepository(db),
    rawEmails: createD1RawEmailRepository(db),
    syncLogs: createD1SyncLogRepository(db),
    syncRuns: createD1SyncRunRepository(db),
    users: createD1UserRepository(db),
  }
}
