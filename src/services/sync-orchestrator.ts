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
     */
    async sync(): Promise<{ runId: string; success: boolean }> {
        const runId = crypto.randomUUID();
        const db = this.env.gym_booking_db;

        // 1. 同期実行の開始を記録
        await db.prepare(`
            INSERT INTO sync_runs (id, status, total_count, success_count, error_count)
            VALUES (?, 'running', 0, 0, 0)
        `).bind(runId).run();

        try {
            // Step 1: Ingest from Gmail to raw_emails
            const { count: ingestedCount } = await this.ingest();

            // total_count を更新（取り込み件数ではなく、全体の処理対象数として一旦更新）
            await db.prepare('UPDATE sync_runs SET total_count = ? WHERE id = ?')
                .bind(ingestedCount, runId).run();

            // Step 2: Process Pending emails
            const { successCount, errorCount } = await this.processPending(runId);

            // 4. 同期全体のステータスを更新して完了
            const finalStatus = errorCount === 0 ? 'success' : (successCount > 0 ? 'partial_success' : 'failure');
            await db.prepare(`
                UPDATE sync_runs 
                SET status = ?, success_count = ?, error_count = ?, executed_at = unixepoch()
                WHERE id = ?
            `).bind(finalStatus, successCount, errorCount, runId).run();

            return { runId, success: true };

        } catch (err: unknown) {
            console.error('Fatal error in sync orchestrator:', err);
            await db.prepare("UPDATE sync_runs SET status = 'failure' WHERE id = ?")
                .bind(runId).run();
            return { runId, success: false };
        }
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
                                VALUES (?, ?, ?, ?, ?, unixepoch(), 'pending')
                            `).bind(
                                detail.id,
                                detail.threadId,
                                detail.subject,
                                detail.snippet,
                                detail.body || null
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
        // 未処理(pending)または失敗(fail)したレコードを対象にする
        const pending = await db.prepare("SELECT * FROM raw_emails WHERE parse_status IN ('pending', 'fail')").all();

        let successCount = 0;
        let errorCount = 0;
        const results = pending.results as any[];

        console.log(`[Process] Found ${results.length} emails to process.`);

        for (const row of results) {
            const rawMailId = row.id;
            const body = row.body || row.snippet;

            try {
                const parsed = EmailParser.parse(body);
                if (!parsed) {
                    throw new Error('Parse failed: Invalid format or unsupported facility');
                }

                await this.saveBooking(parsed, rawMailId);

                // 元データのステータスを更新
                await db.prepare("UPDATE raw_emails SET parse_status = 'success' WHERE id = ?").bind(rawMailId).run();
                await this.logEmailResult(runId, rawMailId, 'success');
                successCount++;

            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                console.error(`[Process] Error for mail ${rawMailId}:`, errorMessage);

                await db.prepare("UPDATE raw_emails SET parse_status = 'fail' WHERE id = ?").bind(rawMailId).run();
                const errorLogDetail = `${errorMessage} | Body Snippet: ${body.substring(0, 200)}`;
                await this.logEmailResult(runId, rawMailId, 'error', errorLogDetail);
                errorCount++;
            }
        }

        return { successCount, errorCount };
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
