-- Migration to add granular logging tables
-- DROP existing tables to ensure schema update in local development
DROP TABLE IF EXISTS sync_logs;
DROP TABLE IF EXISTS sync_runs;

-- 1. Create sync_runs table (Execution Summary)
CREATE TABLE sync_runs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL, -- success, partial_success, failure
    total_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    executed_at INTEGER DEFAULT (unixepoch())
);

-- 2. Create granular sync_logs table (Per-email detail)
CREATE TABLE sync_logs (
    id TEXT PRIMARY KEY,
    sync_run_id TEXT NOT NULL,
    raw_mail_id TEXT NOT NULL,
    status TEXT NOT NULL, -- success, parse_error, db_error
    error_detail TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id)
);
