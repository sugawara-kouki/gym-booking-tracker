import { GmailService } from './gmail';
import { BOOKING_STATUS, EmailParser, ParsedBooking } from './parser';
import { Bindings } from '../index';

/**
 * メール解析ステータスの定数
 */
export const PARSE_STATUS = {
    PENDING: 'pending',
    SUCCESS: 'success',
    FAIL: 'fail',
    SKIPPED: 'skipped',
} as const;

export type ParseStatus = typeof PARSE_STATUS[keyof typeof PARSE_STATUS];

/**
 * 同期実行ステータスの定数
 */
export const SYNC_RUN_STATUS = {
    RUNNING: 'running',
    SUCCESS: 'success',
    PARTIAL_SUCCESS: 'partial_success',
    FAILURE: 'failure',
} as const;

export type SyncRunStatus = typeof SYNC_RUN_STATUS[keyof typeof SYNC_RUN_STATUS];

/**
 * 同期設定のインターフェース
 */
export interface SyncConfig {
    labelIds?: string[];
    maxResults?: number;
}

/**
 * D1 データベースの各テーブル行の型定義
 */
interface RawEmailRow {
    id: string;
    thread_id: string;
    subject: string;
    snippet: string;
    body: string | null;
    parse_status: ParseStatus;
}

/**
 * Gmailからのデータ取得、解析、データベース保存を制御するクラス
 */
export class SyncOrchestrator {
    private readonly DB_BATCH_SIZE = 5;
    private readonly GMAIL_QUERY = 'subject:"札幌市公共施設予約情報システム"';

    constructor(private readonly env: Bindings) { }

    /**
     * Gmailと同期してデータベースを更新するメイン処理
     */
    async sync(): Promise<{ runId: string; success: boolean }> {
        const runId = crypto.randomUUID();
        const db = this.env.gym_booking_db;

        // 1. 同期実行の開始を記録
        await this.initSyncRun(runId);

        try {
            // Step 1: Gmailから未取得メールを取り込む
            const { count: ingestedCount } = await this.ingest();

            // 処理対象件数を更新
            await db.prepare('UPDATE sync_runs SET total_count = ? WHERE id = ?')
                .bind(ingestedCount, runId).run();

            // Step 2: 取り込んだ未処理メールを解析する
            const { successCount, errorCount } = await this.processPending(runId);

            // 4. 同期全体の最終ステータスを確定
            await this.finalizeSyncRun(runId, successCount, errorCount);

            return { runId, success: true };

        } catch (err: unknown) {
            console.error('Fatal error in sync orchestrator:', err);
            await db.prepare("UPDATE sync_runs SET status = ? WHERE id = ?")
                .bind(SYNC_RUN_STATUS.FAILURE, runId).run();
            return { runId, success: false };
        }
    }

    private async initSyncRun(runId: string) {
        await this.env.gym_booking_db.prepare(`
            INSERT INTO sync_runs (id, status, total_count, success_count, error_count)
            VALUES (?, ?, 0, 0, 0)
        `).bind(runId, SYNC_RUN_STATUS.RUNNING).run();
    }

    private async finalizeSyncRun(runId: string, successCount: number, errorCount: number) {
        const finalStatus = errorCount === 0
            ? SYNC_RUN_STATUS.SUCCESS
            : (successCount > 0 ? SYNC_RUN_STATUS.PARTIAL_SUCCESS : SYNC_RUN_STATUS.FAILURE);

        await this.env.gym_booking_db.prepare(`
            UPDATE sync_runs 
            SET status = ?, success_count = ?, error_count = ?, executed_at = unixepoch()
            WHERE id = ?
        `).bind(finalStatus, successCount, errorCount, runId).run();
    }

    /**
     * Gmail APIからメッセージを取得し、raw_emails テーブルに保存する。
     * ページネーションに対応し、条件に一致するメッセージを順次取り込む。
     * すでにDBに存在するメッセージIDに遭遇した時点で、それ以降（過去分）は同期済みと見なし終了する（差分同期）。
     */
    async ingest(maxLimit: number = 2000): Promise<{ count: number }> {
        const gmail = new GmailService(this.env);
        const db = this.env.gym_booking_db;
        const query = 'subject:"札幌市公共施設予約情報システム"';

        console.log(`[Ingest] Starting sync with query: ${query}`);
        let ingested = 0;
        let pageToken: string | undefined = undefined;
        let totalScanned = 0;
        let stopSync = false;

        do {
            // ページごとにメッセージ一覧を取得
            const result = await gmail.listMessages(50, query, pageToken);
            const messages = result.messages;
            pageToken = result.nextPageToken;

            if (messages.length === 0) break;

            // バッチ処理（5件ずつ並列に詳細を取得）
            const batchSize = 5;
            for (let i = 0; i < messages.length; i += batchSize) {
                if (stopSync) break;

                const batch = messages.slice(i, i + batchSize);

                // バッチ内のメッセージがDBに存在するか一括チェック
                const checkResults = await Promise.all(batch.map(async (msg) => {
                    const existing = await db.prepare('SELECT id FROM raw_emails WHERE id = ?').bind(msg.id).first();
                    return { msg, existing: !!existing };
                }));

                // 未取得分のみ抽出
                const toFetch = checkResults.filter(r => !r.existing);

                // 既存のメッセージが見つかった場合、このバッチまたは次のバッチで同期を止める
                if (checkResults.some(r => r.existing)) {
                    console.log(`[Ingest] Found already ingested message. Stopping scan at this point.`);
                    stopSync = true;
                }

                if (toFetch.length > 0) {
                    await Promise.all(toFetch.map(async ({ msg }) => {
                        try {
                            const detail = await gmail.getMessage(msg.id);
                            await db.prepare(`
                                INSERT INTO raw_emails (id, thread_id, subject, snippet, body, fetched_at, parse_status)
                                VALUES (?, ?, ?, ?, ?, unixepoch(), ?)
                            `).bind(
                                detail.id,
                                detail.threadId,
                                detail.subject,
                                detail.snippet,
                                detail.body || null,
                                PARSE_STATUS.PENDING
                            ).run();
                            ingested++;
                        } catch (err) {
                            console.error(`[Ingest] Failed for message ${msg.id}:`, err);
                        }
                    }));
                }

                totalScanned += batch.length;

                if (totalScanned >= maxLimit) {
                    console.log(`[Ingest] Reached maxLimit (${maxLimit}). Stopping.`);
                    stopSync = true;
                    break;
                }
            }

            if (stopSync) {
                pageToken = undefined;
            }
        } while (pageToken);

        console.log(`[Ingest] Finished. Ingested ${ingested} new messages. Total scanned: ${totalScanned}`);
        return { count: ingested };
    }

    /**
     * raw_emails テーブルの未処理データを解析し、bookings テーブルに反映する。
     */
    async processPending(runId: string): Promise<{ successCount: number; errorCount: number }> {
        const db = this.env.gym_booking_db;
        const { results } = await db.prepare("SELECT * FROM raw_emails WHERE parse_status IN (?, ?) ORDER BY fetched_at ASC")
            .bind(PARSE_STATUS.PENDING, PARSE_STATUS.FAIL)
            .all<RawEmailRow>();

        console.log(`[Process] Found ${results.length} emails to process (Chronological order).`);

        let successCount = 0;
        let errorCount = 0;

        for (const row of results) {
            const isSuccess = await this.parseAndSaveRow(runId, row);
            if (isSuccess) successCount++; else errorCount++;
        }

        return { successCount, errorCount };
    }

    /**
     * 1行の生データを解析・保存し、ステータスを更新する
     */
    private async parseAndSaveRow(runId: string, row: RawEmailRow): Promise<boolean> {
        const db = this.env.gym_booking_db;
        const content = row.body || row.snippet;

        try {
            const parsed = EmailParser.parse(content, row.subject);

            // 解析結果が null の場合は「対象外メール」としてマーク
            if (!parsed) {
                await db.prepare("UPDATE raw_emails SET parse_status = ? WHERE id = ?")
                    .bind(PARSE_STATUS.SKIPPED, row.id).run();
                return true;
            }

            await this.saveBooking(parsed, row.id);
            await db.prepare("UPDATE raw_emails SET parse_status = ? WHERE id = ?")
                .bind(PARSE_STATUS.SUCCESS, row.id).run();
            await this.logEmailResult(runId, row.id, PARSE_STATUS.SUCCESS, `Status: ${parsed.status}`);
            return true;

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await db.prepare("UPDATE raw_emails SET parse_status = ? WHERE id = ?")
                .bind(PARSE_STATUS.FAIL, row.id).run();
            await this.logEmailResult(runId, row.id, 'error', `FAIL: ${msg}`);
            return false;
        }
    }

    /**
     * 予約情報を bookings テーブルに保存する
     */
    private async saveBooking(booking: ParsedBooking, rawMailId: string) {
        const db = this.env.gym_booking_db;
        const id = booking.registration_number || crypto.randomUUID();

        // status の上書きガード: won または confirmed の場合は applied で上書きしない
        // 定数もパラメータとして渡すことで SQL 側をクリーンに保つ
        await db.prepare(`
      INSERT INTO bookings (
        id, facility_name, event_date, event_end_date, 
        registration_number, purpose, status, raw_mail_id, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, unixepoch())
      ON CONFLICT(raw_mail_id) DO UPDATE SET
        status = CASE 
          WHEN excluded.status = ?9 AND status IN (?10, ?11) THEN status
          ELSE excluded.status
        END,
        updated_at = unixepoch()
      ON CONFLICT(id) DO UPDATE SET
        status = CASE 
          WHEN excluded.status = ?9 AND status IN (?10, ?11) THEN status
          ELSE excluded.status
        END,
        updated_at = unixepoch()
    `).bind(
            id,                     // ?1
            booking.facility_name,  // ?2
            booking.event_date,      // ?3
            booking.event_end_date || null, // ?4
            booking.registration_number || null, // ?5
            booking.purpose || null, // ?6
            booking.status,         // ?7
            rawMailId,              // ?8
            BOOKING_STATUS.APPLIED, // ?9
            BOOKING_STATUS.WON,     // ?10
            BOOKING_STATUS.CONFIRMED // ?11
        ).run();
    }

    /**
     * 各メールの処理結果を個別ログ (sync_logs) に記録する
     */
    private async logEmailResult(runId: string, mailId: string, status: string, errorDetail?: string) {
        const db = this.env.gym_booking_db;
        await db.prepare(`
      INSERT INTO sync_logs (id, sync_run_id, raw_mail_id, status, error_detail)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), runId, mailId, status, errorDetail || null).run();
    }
}
