-- Create raw_emails table for staged synchronization
CREATE TABLE IF NOT EXISTS raw_emails (
    id TEXT PRIMARY KEY,          -- Gmail Message ID
    thread_id TEXT NOT NULL,      -- Gmail Thread ID
    subject TEXT,                 -- Email Subject
    snippet TEXT,                 -- Email Snippet
    body TEXT,                    -- Decoded Email Body
    fetched_at INTEGER NOT NULL,  -- Timestamp (UNIX epoch)
    parse_status TEXT DEFAULT 'pending' -- 'pending', 'success', 'fail'
);

-- Index for performance when processing pending emails
CREATE INDEX IF NOT EXISTS idx_raw_emails_parse_status ON raw_emails(parse_status);
