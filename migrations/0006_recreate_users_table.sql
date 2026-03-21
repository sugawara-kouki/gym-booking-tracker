-- Migration number: 0006 	 2026-03-22T00:00:00Z

-- 既存のデータを破棄し、より汎用的なスキーマで再作成する
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  -- 内部的なプライマリキー（UUID v4 を想定）
  id TEXT PRIMARY KEY,
  
  -- どのプロバイダー（google, apple 等）のユーザーか
  provider TEXT NOT NULL,
  
  -- プロバイダー側での一意なユーザーID
  provider_user_id TEXT NOT NULL,
  
  -- 基本プロフィール情報
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  
  -- セッショントークン情報（暗号化済み）
  refresh_token_encrypted TEXT,
  access_token_encrypted TEXT,
  access_token_expires_at INTEGER,
  
  -- タイムスタンプ
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- 同じプロバイダー内での重複を防ぐ
  UNIQUE(provider, provider_user_id)
);
