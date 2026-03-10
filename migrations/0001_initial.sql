-- Initial migration for Gym Booking Tracker

-- 1. Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    facility_name TEXT NOT NULL,
    event_date TEXT NOT NULL,
    event_end_date TEXT,
    registration_number TEXT,
    purpose TEXT,
    court_info TEXT,
    status TEXT NOT NULL,
    raw_mail_id TEXT UNIQUE NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- 2. Create sync_logs table
CREATE TABLE IF NOT EXISTS sync_logs (
    id TEXT PRIMARY KEY,
    sync_type TEXT NOT NULL,
    status TEXT NOT NULL,
    processed_count INTEGER DEFAULT 0,
    error_detail TEXT,
    executed_at INTEGER DEFAULT (unixepoch())
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_bookings_event_date ON bookings(event_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_raw_mail_id ON bookings(raw_mail_id);
