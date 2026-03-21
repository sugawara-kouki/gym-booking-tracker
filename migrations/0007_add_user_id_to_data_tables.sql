-- Migration number: 0007 	 2026-03-22T00:30:00Z

-- すべてのデータ・ログに user_id を紐付け、マルチテナント対応を行う
-- 既存データは破棄して再作成する

DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS raw_emails;
DROP TABLE IF EXISTS sync_logs;
DROP TABLE IF EXISTS sync_runs;

-- 1. 生メール取り込みテーブル
CREATE TABLE raw_emails (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,         -- 所有者
    thread_id TEXT NOT NULL,
    subject TEXT,
    snippet TEXT,
    body TEXT,
    fetched_at INTEGER NOT NULL,
    parse_status TEXT DEFAULT 'pending',
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_raw_emails_user_parse ON raw_emails(user_id, parse_status);

-- 2. 解析済み予約データテーブル
CREATE TABLE bookings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,         -- 所有者
    facility_name TEXT NOT NULL,
    event_date TEXT NOT NULL,
    event_end_date TEXT,
    registration_number TEXT,
    purpose TEXT,
    court_info TEXT,
    status TEXT NOT NULL,
    raw_mail_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (raw_mail_id) REFERENCES raw_emails(id)
);
CREATE INDEX idx_bookings_user_date ON bookings(user_id, event_date);
CREATE UNIQUE INDEX idx_bookings_user_raw_mail ON bookings(user_id, raw_mail_id);

-- 3. 同期実行記録テーブル
CREATE TABLE sync_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,         -- 実行者
    status TEXT NOT NULL,
    total_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    executed_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_sync_runs_user_date ON sync_runs(user_id, executed_at);

-- 4. 同期詳細ログテーブル
CREATE TABLE sync_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,         -- 所有者
    sync_run_id TEXT NOT NULL,
    raw_mail_id TEXT,
    status TEXT NOT NULL,          -- 'success', 'error'
    error_detail TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (sync_run_id) REFERENCES sync_runs(id)
);
CREATE INDEX idx_sync_logs_user_run ON sync_logs(user_id, sync_run_id);
