import { GmailService } from './gmail';
import { BOOKING_STATUS, EmailParser, ParsedBooking } from './parser';
import { Bindings } from '../types';
import { createRepositories, Repositories } from '../repositories';
import { RawEmailRow } from '../repositories/types';
import { Logger } from '../utils/logger';

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
 * Gmailからのデータ取得、解析、データベース保存を制御するクラス
 */
export class SyncOrchestrator {
    // APIレート制限やリソース消費を抑えるための並列実行数
    private readonly DB_BATCH_SIZE = 5;
    // 札幌市の施設予約システムからのメールのみを対象とするクエリ
    private readonly GMAIL_QUERY = 'subject:"札幌市公共施設予約情報システム"';
    private readonly repos: Repositories;
    private readonly gmail: GmailService;

    constructor(private readonly env: Bindings, gmailService: GmailService) {
        this.repos = createRepositories(env.gym_booking_db);
        this.gmail = gmailService;
    }

    /**
     * Gmailと同期してデータベースを更新するメイン処理
     */
    async sync(): Promise<{ runId: string; success: boolean }> {
        const runId = crypto.randomUUID();

        // 同期実行の開始を記録
        await this.initSyncRun(runId);

        try {
            // Gmailから未取得メールを取り込む（Ingest層）
            const { count: ingestedCount } = await this.ingest();

            // 今回の実行で処理すべき総件数を保存
            await this.repos.syncRuns.updateTotalCount(runId, ingestedCount);

            // 取り込んだ未処理メールを解析する（Process層）
            const { successCount, errorCount } = await this.processPending(runId);

            // 同期全体の最終ステータスを確定
            await this.finalizeSyncRun(runId, successCount, errorCount);

            return { runId, success: true };

        } catch (err: unknown) {
            Logger.error(null, 'Fatal error in sync orchestrator', { runId, error: err });
            // 致命的なエラー時はステータスを FAILURE に設定
            await this.repos.syncRuns.finalize(runId, SYNC_RUN_STATUS.FAILURE, 0, 0);
            return { runId, success: false };
        }
    }

    private async initSyncRun(runId: string) {
        await this.repos.syncRuns.create(runId);
    }

    private async finalizeSyncRun(runId: string, successCount: number, errorCount: number) {
        // 全件成功なら SUCCESS、一部成功なら PARTIAL_SUCCESS、全件失敗なら FAILURE
        const finalStatus = errorCount === 0
            ? SYNC_RUN_STATUS.SUCCESS
            : (successCount > 0 ? SYNC_RUN_STATUS.PARTIAL_SUCCESS : SYNC_RUN_STATUS.FAILURE);

        await this.repos.syncRuns.finalize(runId, finalStatus, successCount, errorCount);
    }

    /**
     * Gmail APIからメッセージを取得し、raw_emails テーブルに保存する。
     * ページネーションに対応し、条件に一致するメッセージを順次取り込む。
     * すでにDBに存在するメッセージIDに遭遇した時点で、それ以降（過去分）は同期済みと見なし終了する（差分同期）。
     */
    async ingest(maxLimit: number = 2000): Promise<{ count: number }> {
        Logger.info(null, 'Starting ingest process', { query: this.GMAIL_QUERY });
        let ingested = 0;
        let pageToken: string | undefined = undefined;
        let totalScanned = 0;
        let stopSync = false;

        do {
            // ページごとにメッセージ一覧を取得
            const result = await this.gmail.listMessages(50, this.GMAIL_QUERY, pageToken);
            const messages = result.messages;
            pageToken = result.nextPageToken;

            if (messages.length === 0) break;

            // バッチ処理（5件ずつ並列に詳細を取得してDB負荷を分散）
            for (let i = 0; i < messages.length; i += this.DB_BATCH_SIZE) {
                if (stopSync) break;

                const batch = messages.slice(i, i + this.DB_BATCH_SIZE);

                // バッチ内のメッセージがDBに存在するか一括チェック（無駄な fetch を防ぐ）
                const checkResults = await Promise.all(batch.map(async (msg: { id: string }) => {
                    const existing = await this.repos.rawEmails.findById(msg.id);
                    return { msg, existing: !!existing };
                }));

                // 未取得分のみ抽出
                const toFetch = checkResults.filter(r => !r.existing);

                // 差分同期：既存のメッセージが見つかった場合、それより過去は取り込み済みと判断してループを抜ける
                if (checkResults.some(r => r.existing)) {
                    Logger.info(null, 'Found already ingested message. Stopping scan.');
                    stopSync = true;
                }

                if (toFetch.length > 0) {
                    await Promise.all(toFetch.map(async ({ msg }) => {
                        try {
                            const detail = await this.gmail.getMessage(msg.id);
                            await this.repos.rawEmails.create({
                                id: detail.id,
                                thread_id: detail.threadId,
                                subject: detail.subject,
                                snippet: detail.snippet,
                                body: detail.body || null,
                                parse_status: PARSE_STATUS.PENDING
                            });
                            ingested++;
                        } catch (err) {
                            Logger.error(null, 'Failed to fetch/save message', { messageId: msg.id, error: err });
                        }
                    }));
                }

                totalScanned += batch.length;

                // 際限ないスキャンを防ぐための安全装置
                if (totalScanned >= maxLimit) {
                    Logger.info(null, 'Reached maxLimit. Stopping.', { maxLimit });
                    stopSync = true;
                    break;
                }
            }

            if (stopSync) {
                pageToken = undefined;
            }
        } while (pageToken);

        Logger.info(null, 'Ingest finished', { ingested, totalScanned });
        return { count: ingested };
    }

    /**
     * raw_emails テーブルの未処理データを解析し、bookings テーブルに反映する。
     */
    async processPending(runId: string): Promise<{ successCount: number; errorCount: number }> {
        const results = await this.repos.rawEmails.findPending();

        Logger.info(null, 'Found emails to process', { count: results.length, runId });

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
        const content = row.body || row.snippet;

        try {
            const parsed = EmailParser.parse(content, row.subject);

            // 解析結果が null の場合は「対象外メール（例：ただの通知メール）」として SKIPPED マーク
            if (!parsed) {
                await this.repos.rawEmails.updateParseStatus(row.id, PARSE_STATUS.SKIPPED);
                return true;
            }

            // 予約情報の保存とステータスの更新
            await this.saveBooking(parsed, row.id);
            await this.repos.rawEmails.updateParseStatus(row.id, PARSE_STATUS.SUCCESS);
            await this.logEmailResult(runId, row.id, PARSE_STATUS.SUCCESS, `Status: ${parsed.status}`);
            return true;

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await this.repos.rawEmails.updateParseStatus(row.id, PARSE_STATUS.FAIL);
            await this.logEmailResult(runId, row.id, 'error', `FAIL: ${msg}`);
            return false;
        }
    }

    /**
     * 予約情報を bookings テーブルに保存する。登録番号をキーにして Upsert する。
     */
    private async saveBooking(booking: ParsedBooking, rawMailId: string) {
        // 登録番号がない場合は臨時 ID を生成（通常は存在するはず）
        const id = booking.registration_number || crypto.randomUUID();

        await this.repos.bookings.upsert({
            id,
            facility_name: booking.facility_name,
            event_date: booking.event_date,
            event_end_date: booking.event_end_date || null,
            registration_number: booking.registration_number || null,
            purpose: booking.purpose || null,
            status: booking.status,
            raw_mail_id: rawMailId,
        });
    }

    /**
     * 各メールの処理結果を個別ログ (sync_logs) に記録する
     */
    private async logEmailResult(runId: string, mailId: string, status: string, errorDetail?: string) {
        await this.repos.syncLogs.create({
            id: crypto.randomUUID(),
            sync_run_id: runId,
            raw_mail_id: mailId,
            status,
            error_detail: errorDetail || null
        });
    }
}
