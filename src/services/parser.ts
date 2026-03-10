/**
 * メール本文から予約情報を抽出するためのサービス
 */
export interface ParsedBooking {
    facility_name: string;
    event_date: string;      // ISO8601 (YYYY-MM-DD HH:mm)
    event_end_date?: string; // ISO8601 (YYYY-MM-DD HH:mm)
    registration_number?: string;
    purpose?: string;
    status: 'applied' | 'won' | 'confirmed' | 'cancelled';
}

export class EmailParser {
    /**
     * 札幌市公共施設予約システムのメール本文を解析する
     */
    static parse(body: string): ParsedBooking | null {
        // 1. 各項目の抽出用正規表現
        const facilityRegex = /【施設室場】(.*)/;
        const dateRegex = /【利用日時】(\d{4})年(\d{1,2})月(\d{1,2})日\(.\)(\d{1,2}:\d{2})～(\d{1,2}:\d{2})/;
        const regNoRegex = /【受付番号】([\d-]+)/;
        const purposeRegex = /【利用目的】(.*)/;

        // 2. ステータスの判定
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

        if (!facilityMatch || !dateMatch) {
            return null;
        }

        const year = dateMatch[1];
        const month = dateMatch[2].padStart(2, '0');
        const day = dateMatch[3].padStart(2, '0');
        const startTime = dateMatch[4].padStart(5, '0'); // H:mm -> 0H:mm
        const endTime = dateMatch[5].padStart(5, '0');

        // ISO8601形式 (YYYY-MM-DD HH:mm) に変換
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
