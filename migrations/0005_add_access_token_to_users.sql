-- Migration number: 0005 	 2026-03-20T22:00:00Z

ALTER TABLE users ADD COLUMN access_token_encrypted TEXT;
ALTER TABLE users ADD COLUMN access_token_expires_at INTEGER;
