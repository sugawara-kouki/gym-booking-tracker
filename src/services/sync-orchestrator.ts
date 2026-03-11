import { GmailService } from './gmail';
import { EmailParser, ParsedBooking } from './parser';
import { Bindings } from '../index';

/**
 * 同期設定のインターフェース
 */
export interface SyncConfig {
    labelIds?: string[];
    maxResults?: number;
}

/**
 * Gmailからのデータ取得、解析、データベース保存を制御するクラス
 */
export class SyncOrchestrator {
    constructor(private env: Bindings) { }

    /**
     * Gmailと同期してデータベースを更新するメイン処理
     * 
     * 1. 実行ログをDBに記録
     * 2. Gmail APIからメッセージ一覧を取得
     * 3. 各メッセージの本文を取得・解析し、予約情報をDBへ保存
     * 4. 実行結果（成功数・失敗数等）をDBへ記録
     * 
     * @returns 実行IDと成否
     */
    async sync(): Promise<{ runId: string; success: boolean }> {
        const db = this.env.gym_booking_db;
        const gmail = new GmailService(this.env);
        const runId = crypto.randomUUID();

        // 1. 同期実行の開始を記録
        await db.prepare(`
      INSERT INTO sync_runs (id, status, total_count, success_count, error_count)
      VALUES (?, 'running', 0, 0, 0)
    `).bind(runId).run();

        let totalCount = 0;
        let successCount = 0;
        let errorCount = 0;

        try {
            // 2. メッセージ一覧の取得
            // 札幌市のシステムからのメールを対象とする
            const limit = 10;
            const query = 'subject:"札幌市公共施設予約情報システム"';
            console.log(`[Sync] Fetching up to ${limit} messages with query: ${query}`);
            const messages = await gmail.listMessages(limit, query);
            totalCount = messages.length;
            console.log(`[Sync] Found ${totalCount} messages to process.`);

            // 取得件数が判明した時点で total_count を更新
            await db.prepare('UPDATE sync_runs SET total_count = ? WHERE id = ?')
                .bind(totalCount, runId).run();

            // 3. 各メッセージの個別処理
            let processed = 0;
            for (const msg of messages) {
                const rawMailId = msg.id;
                processed++;
                if (processed % 10 === 0) {
                    console.log(`[Sync] Progress: ${processed}/${totalCount}...`);
                }
                let detail: { id: string; snippet: string; body?: string } | null = null;
                try {
                    // 詳細（本文）を取得
                    detail = await gmail.getMessage(rawMailId);
                    if (!detail || !detail.snippet) {
                        throw new Error('Email body is empty');
                    }

                    // 本文を解析してオブジェクトに変換
                    const parsed = EmailParser.parse(detail.body || detail.snippet);
                    if (!parsed) {
                        // 解析パターンに一致しない場合は警告を出してスキップ
                        console.warn(`[Parse Skip] Mail ID ${rawMailId} did not match patterns. Snippet: ${detail.snippet.substring(0, 100)}...`);
                        throw new Error('Parse failed: Invalid format or unsupported facility');
                    }

                    // 解析結果をDBへ保存
                    await this.saveBooking(parsed, rawMailId);

                    // 成功ログを記録
                    await this.logEmailResult(runId, rawMailId, 'success');
                    successCount++;

                } catch (err: unknown) {
                    const errorMessage = err instanceof Error ? err.message : String(err);
                    console.error(`Error processing mail ${rawMailId}:`, errorMessage);
                    
                    // 調査を容易にするため、失敗時の情報を詳細ログに含める
                    const bodyInfo = detail ? (detail.body || detail.snippet) : 'No body available';
                    const errorLogDetail = `${errorMessage} | Body: ${bodyInfo}`;
                    await this.logEmailResult(runId, rawMailId, 'error', errorLogDetail);
                    errorCount++;
                }
            }

            // 4. 同期全体のステータスを更新して完了
            const finalStatus = errorCount === 0 ? 'success' : (successCount > 0 ? 'partial_success' : 'failure');
            await db.prepare(`
        UPDATE sync_runs 
        SET status = ?, success_count = ?, error_count = ?, executed_at = unixepoch()
        WHERE id = ?
      `).bind(finalStatus, successCount, errorCount, runId).run();

            return { runId, success: true };

        } catch (err: unknown) {
            // 予期せぬ致命的なエラーが発生した場合
            console.error('Fatal error in sync orchestrator:', err);
            await db.prepare("UPDATE sync_runs SET status = 'failure' WHERE id = ?")
                .bind(runId).run();
            return { runId, success: false };
        }
    }

    /**
     * 予約情報を bookings テーブルに保存する
     * 受付番号（id）またはメールIDが重複している場合は、最新の情報で上書き（ステータス更新）を行う
     * 
     * @param booking 解析済みの予約情報
     * @param rawMailId 元となったメールID
     */
    private async saveBooking(booking: ParsedBooking, rawMailId: string) {
        const db = this.env.gym_booking_db;
        const id = booking.registration_number || crypto.randomUUID();

        await db.prepare(`
      INSERT INTO bookings (
        id, facility_name, event_date, event_end_date, 
        registration_number, purpose, status, raw_mail_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      ON CONFLICT(raw_mail_id) DO UPDATE SET
        status = excluded.status,
        updated_at = unixepoch()
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        updated_at = unixepoch()
    `).bind(
            id,
            booking.facility_name,
            booking.event_date,
            booking.event_end_date || null,
            booking.registration_number || null,
            booking.purpose || null,
            booking.status,
            rawMailId
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
