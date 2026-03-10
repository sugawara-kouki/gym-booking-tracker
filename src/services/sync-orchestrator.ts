import { GmailService } from './gmail';
import { EmailParser, ParsedBooking } from './parser';

export interface SyncConfig {
    labelIds?: string[];
    maxResults?: number;
}

export class SyncOrchestrator {
    constructor(private env: any) { }

    /**
     * Gmailと同期してデータベースを更新するメイン処理
     */
    async sync(): Promise<{ runId: string; success: boolean }> {
        const db = this.env.gym_booking_db;
        const gmail = new GmailService(this.env);
        const runId = crypto.randomUUID();

        // 1. 実行開始の記録
        await db.prepare(`
      INSERT INTO sync_runs (id, status, total_count, success_count, error_count)
      VALUES (?, 'running', 0, 0, 0)
    `).bind(runId).run();

        let totalCount = 0;
        let successCount = 0;
        let errorCount = 0;

        try {
            // 2. メッセージ一覧の取得
            const limit = 500;
            const query = 'subject:"札幌市公共施設予約情報システム"';
            console.log(`[Sync] Fetching up to ${limit} messages with query: ${query}`);
            const messages = await gmail.listMessages(limit, query);
            totalCount = messages.length;
            console.log(`[Sync] Found ${totalCount} messages to process.`);

            // sync_runs の total_count を更新
            await db.prepare('UPDATE sync_runs SET total_count = ? WHERE id = ?')
                .bind(totalCount, runId).run();

            // 3. 各メッセージの処理
            let processed = 0;
            for (const msg of messages) {
                const rawMailId = msg.id;
                processed++;
                if (processed % 10 === 0) {
                    console.log(`[Sync] Progress: ${processed}/${totalCount}...`);
                }
                let detail: any = null;
                try {
                    // 詳細（本文）を取得
                    detail = await gmail.getMessage(rawMailId);
                    if (!detail || !detail.snippet) {
                        throw new Error('Email body is empty');
                    }

                    // 解析
                    const parsed = EmailParser.parse(detail.body || detail.snippet);
                    if (!parsed) {
                        console.warn(`[Parse Skip] Mail ID ${rawMailId} did not match patterns. Snippet: ${detail.snippet.substring(0, 100)}...`);
                        throw new Error('Parse failed: Invalid format or unsupported facility');
                    }

                    // DBへ保存 (INSERT OR REPLACE)
                    await this.saveBooking(parsed, rawMailId);

                    // 個別ログ記録 (Success)
                    await this.logEmailResult(runId, rawMailId, 'success');
                    successCount++;

                } catch (err: any) {
                    console.error(`Error processing mail ${rawMailId}:`, err.message);
                    // 失敗した場合は、調査のために本文の一部または全部をログに含める
                    const bodyInfo = detail ? (detail.body || detail.snippet) : 'No body available';
                    const errorLogDetail = `${err.message} | Body: ${bodyInfo}`;
                    await this.logEmailResult(runId, rawMailId, 'error', errorLogDetail);
                    errorCount++;
                }
            }

            // 4. 実行完了の更新
            const finalStatus = errorCount === 0 ? 'success' : (successCount > 0 ? 'partial_success' : 'failure');
            await db.prepare(`
        UPDATE sync_runs 
        SET status = ?, success_count = ?, error_count = ?, executed_at = unixepoch()
        WHERE id = ?
      `).bind(finalStatus, successCount, errorCount, runId).run();

            return { runId, success: true };

        } catch (err: any) {
            console.error('Fatal error in sync orchestrator:', err);
            await db.prepare("UPDATE sync_runs SET status = 'failure' WHERE id = ?")
                .bind(runId).run();
            return { runId, success: false };
        }
    }

    /**
     * 予約情報を保存する。受付番号が同じなら上書き（ステータス更新）
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

    private async logEmailResult(runId: string, mailId: string, status: string, errorDetail?: string) {
        const db = this.env.gym_booking_db;
        await db.prepare(`
      INSERT INTO sync_logs (id, sync_run_id, raw_mail_id, status, error_detail)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), runId, mailId, status, errorDetail || null).run();
    }
}
