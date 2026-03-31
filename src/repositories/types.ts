import { ParseStatus as BaseParseStatus, SyncRunStatus as BaseSyncRunStatus } from '../services/sync-orchestrator';

export type ParseStatus = BaseParseStatus;
export type SyncRunStatus = BaseSyncRunStatus;

/**
 * データベースの各テーブル行の基本型定義
 */

export interface RawEmailRow {
    id: string;
    user_id: string; // 所有者
    thread_id: string;
    subject: string;
    snippet: string;
    body: string | null;
    fetched_at: number;
    parse_status: ParseStatus;
}

export interface SyncRunRow {
    id: string;
    user_id: string; // 実行者
    status: SyncRunStatus;
    total_count: number;
    success_count: number;
    error_count: number;
    executed_at: number | null;
}

export interface UserRow {
    id: string; // 内部的な UUID
    provider: string; // 'google' など
    provider_user_id: string; // プロバイダー側での一意な ID
    email: string;
    name: string | null;
    refresh_token_encrypted: string | null;
    access_token_encrypted: string | null;
    access_token_expires_at: number | null;
    created_at: number;
    updated_at: number;
}

export interface BookingRow {
    id: string;
    user_id: string; // 所有者
    facility_name: string;
    event_date: string;
    event_end_date: string | null;
    registration_number: string | null;
    purpose: string | null;
    court_info: string | null;
    status: string;
    raw_mail_id: string;
    updated_at: number;
}

export interface SyncLogRow {
    id: string;
    user_id: string; // 所有者
    sync_run_id: string;
    raw_mail_id: string;
    status: string;
    error_detail: string | null;
}

/**
 * users テーブルの操作インターフェース
 */
export interface UserRepository {
    findById(id: string): Promise<UserRow | null>;
    findByProviderId(provider: string, providerUserId: string): Promise<UserRow | null>;
    upsert(user: Omit<UserRow, 'created_at' | 'updated_at'>): Promise<void>;
}

/**
 * 各 Repository のインターフェース
 */

export interface BookingRepository {
    upsert(userId: string, booking: Omit<BookingRow, 'user_id' | 'updated_at'>): Promise<void>;
    findAll(userId: string): Promise<BookingRow[]>;
    deleteAll(userId: string): Promise<void>; // ユーザー単位での削除安全性を確保
}

export interface RawEmailRepository {
    findById(userId: string, id: string): Promise<RawEmailRow | null>;
    create(userId: string, email: Omit<RawEmailRow, 'user_id' | 'fetched_at'>): Promise<void>;
    updateParseStatus(userId: string, id: string, status: ParseStatus): Promise<void>;
    findPending(userId: string): Promise<RawEmailRow[]>;
    deleteAll(userId: string): Promise<void>;
}

export interface SyncRunRepository {
    create(userId: string, runId: string): Promise<void>;
    findById(userId: string, runId: string): Promise<SyncRunRow | null>;
    updateTotalCount(userId: string, runId: string, totalCount: number): Promise<void>;
    findLastSuccess(userId: string): Promise<SyncRunRow | null>;
    finalize(userId: string, runId: string, status: SyncRunStatus, successCount: number, errorCount: number): Promise<void>;
    deleteAll(userId: string): Promise<void>;
}

export interface SyncLogRepository {
    create(userId: string, log: Omit<SyncLogRow, 'user_id'>): Promise<void>;
    deleteAll(userId: string): Promise<void>;
}

export interface Repositories {
    users: UserRepository;
    bookings: BookingRepository;
    rawEmails: RawEmailRepository;
    syncRuns: SyncRunRepository;
    syncLogs: SyncLogRepository;
}
