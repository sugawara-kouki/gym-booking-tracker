import { ParseStatus as BaseParseStatus, SyncRunStatus as BaseSyncRunStatus } from '../services/sync-orchestrator';

export type ParseStatus = BaseParseStatus;
export type SyncRunStatus = BaseSyncRunStatus;

/**
 * データベースの各テーブル行の基本型定義
 */

export interface RawEmailRow {
    id: string;
    thread_id: string;
    subject: string;
    snippet: string;
    body: string | null;
    fetched_at: number;
    parse_status: ParseStatus;
}

export interface SyncRunRow {
    id: string;
    status: SyncRunStatus;
    total_count: number;
    success_count: number;
    error_count: number;
    executed_at: number | null;
}

export interface UserRow {
    id: string;
    email: string;
    name: string;
    refresh_token_encrypted: string | null;
    access_token_encrypted: string | null;
    access_token_expires_at: number | null;
    created_at: number;
    updated_at: number;
}

export interface BookingRow {
    id: string;
    facility_name: string;
    event_date: string;
    event_end_date: string | null;
    registration_number: string | null;
    purpose: string | null;
    status: string;
    raw_mail_id: string;
    updated_at: number;
}

export interface SyncLogRow {
    id: string;
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
    upsert(user: Omit<UserRow, 'created_at' | 'updated_at'>): Promise<void>;
}

/**
 * 各 Repository のインターフェース
 */

export interface BookingRepository {
    upsert(booking: Omit<BookingRow, 'updated_at'>): Promise<void>;
    findAll(): Promise<BookingRow[]>;
    deleteAll(): Promise<void>;
}

export interface RawEmailRepository {
    findById(id: string): Promise<RawEmailRow | null>;
    create(email: Omit<RawEmailRow, 'fetched_at'>): Promise<void>;
    updateParseStatus(id: string, status: ParseStatus): Promise<void>;
    findPending(): Promise<RawEmailRow[]>;
    deleteAll(): Promise<void>;
}

export interface SyncRunRepository {
    create(runId: string): Promise<void>;
    updateTotalCount(runId: string, totalCount: number): Promise<void>;
    finalize(runId: string, status: SyncRunStatus, successCount: number, errorCount: number): Promise<void>;
    deleteAll(): Promise<void>;
}

export interface SyncLogRepository {
    create(log: SyncLogRow): Promise<void>;
    deleteAll(): Promise<void>;
}
