/**
 * メール本文から予約情報を抽出するためのサービス
 */
export interface ParsedBooking {
    /** 施設名 */
    facility_name: string;
    /** 利用開始日時 (ISO8601形式: YYYY-MM-DD HH:mm) */
    event_date: string;
    /** 利用終了日時 (ISO8601形式: YYYY-MM-DD HH:mm) */
    event_end_date?: string;
    /** 受付番号 */
    registration_number?: string;
    /** 利用目的 */
    purpose?: string;
    /** 予約ステータス */
    status: 'applied' | 'won' | 'confirmed' | 'cancelled';
}

/**
 * メールのテキスト内容を解析して予約情報を抽出するクラス
 */
export class EmailParser {
    /**
     * 札幌市公共施設予約システムの通知メールを解析する
     * 
     * @param body メールの本文テキスト
     * @returns 解析結果。必須項目（施設、日時）が欠けている場合は null
     */
    static parse(body: string): ParsedBooking | null {
        // 1. 各項目の抽出用正規表現
        // 【施設室場】の直後の文字列を施設名として取得
        const facilityRegex = /【施設室場】(.*)/;
        
        // 【利用日時】から年月日、曜日、開始・終了時間を取得
        // 例: 2024年03月11日(月)09:00～11:00
        const dateRegex = /【利用日時】(\d{4})年(\d{1,2})月(\d{1,2})日\(.\)(\d{1,2}:\d{2})～(\d{1,2}:\d{2})/;
        
        // 【受付番号】の数字とハイフンを取得
        const regNoRegex = /【受付番号】([\d-]+)/;
        
        // 【利用目的】の直後の文字列を取得
        const purposeRegex = /【利用目的】(.*)/;

        // 2. ステータスの判定
        // メールの本文に含まれる特定のキーワードから現在の状態を推論する
        let status: ParsedBooking['status'] = 'applied';
        if (body.includes('抽選に当選されました')) {
            status = 'won';
        } else if (body.includes('抽選申込を受付けました')) {
            status = 'applied';
        } else if (body.includes('利用申込の手続きを完了')) {
            status = 'confirmed';
        } else if (body.includes('キャンセル')) {
            status = 'cancelled';
        }

        // 3. 情報の抽出
        const facilityMatch = body.match(facilityRegex);
        const dateMatch = body.match(dateRegex);
        const regNoMatch = body.match(regNoRegex);
        const purposeMatch = body.match(purposeRegex);

        // 施設名と日時が取れないメールは、本システムの対象外（またはパース失敗）とみなす
        if (!facilityMatch || !dateMatch) {
            return null;
        }

        // 日付パーツの整形 (1桁の月日を2桁に揃える)
        const year = dateMatch[1];
        const month = dateMatch[2].padStart(2, '0');
        const day = dateMatch[3].padStart(2, '0');
        const startTime = dateMatch[4].padStart(5, '0'); // H:mm -> 0H:mm
        const endTime = dateMatch[5].padStart(5, '0');

        // DB保存に適した ISO8601 風の形式 (YYYY-MM-DD HH:mm) に変換
        const eventDate = `${year}-${month}-${day} ${startTime}`;
        const eventEndDate = `${year}-${month}-${day} ${endTime}`;

        return {
            facility_name: facilityMatch[1].trim(),
            event_date: eventDate,
            event_end_date: eventEndDate,
            registration_number: regNoMatch ? regNoMatch[1].trim() : undefined,
            purpose: purposeMatch ? purposeMatch[1].trim() : undefined,
            status
        };
    }
}
