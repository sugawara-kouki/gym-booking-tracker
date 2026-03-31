/**
 * 予約ステータスの定数
 */
export const BOOKING_STATUS = {
  APPLIED: 'applied', // 抽選申込中
  WON: 'won', // 当選（未確定）
  CONFIRMED: 'confirmed', // 予約確定
  CANCELLED: 'cancelled', // キャンセル
} as const

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS]

/**
 * メール本文から予約情報を抽出するためのインターフェース
 */
export interface ParsedBooking {
  /** 施設名 (例: 〇〇体育館 競技場) */
  facility_name: string
  /** 利用開始日時 (ISO8601形式: YYYY-MM-DD HH:mm) */
  event_date: string
  /** 利用終了日時 (ISO8601形式: YYYY-MM-DD HH:mm) */
  event_end_date: string
  /** 受付番号 (例: 123456-78) */
  registration_number?: string
  /** 利用目的 */
  purpose?: string
  /** コート情報等 */
  court_info?: string
  /** 予約ステータス */
  status: BookingStatus
}

/**
 * 札幌市公共施設予約システムからのメールを解析するクラス
 */
export class EmailParser {
  // 抽出用の正規表現を定数化
  private static readonly FACILITY_REGEX = /【施設室場】(.*)/
  private static readonly DATE_REGEX =
    /【利用日時】(\d{4})年(\d{1,2})月(\d{1,2})日\(.\)(\d{1,2}:\d{2})～(\d{1,2}:\d{2})/
  private static readonly REG_NO_REGEX = /【受付番号】([\d-]+)/
  private static readonly PURPOSE_REGEX = /【利用目的】(.*)/

  /**
   * メールのテキスト内容を解析して予約情報を抽出する
   *
   * @param body メールの本文テキスト
   * @param subject メールの件名（任意）
   * @returns 解析結果。必須項目（施設、日時）が欠けている場合は null
   */
  static parse(body: string, subject?: string): ParsedBooking | null {
    // 1. 各項目の抽出実行
    const facilityMatch = body.match(EmailParser.FACILITY_REGEX)
    const dateMatch = body.match(EmailParser.DATE_REGEX)

    // 必須項目（施設名と日時）が取れない場合は、対象外のメールとして扱う
    if (!facilityMatch || !dateMatch) {
      return null
    }

    // 2. ステータスの推論
    const status = EmailParser.determineStatus(body, subject)

    // 3. 日時情報の整形
    const { eventDate, eventEndDate } = EmailParser.formatDateRange(dateMatch)

    // 4. その他の情報の抽出
    const registrationNumber = body.match(EmailParser.REG_NO_REGEX)?.[1].trim()
    const purpose = body.match(EmailParser.PURPOSE_REGEX)?.[1].trim()

    return {
      facility_name: facilityMatch[1].trim(),
      event_date: eventDate,
      event_end_date: eventEndDate,
      registration_number: registrationNumber,
      purpose: purpose,
      status,
    }
  }

  /**
   * 本文または件名の内容から予約ステータスを判定する
   */
  private static determineStatus(body: string, subject?: string): BookingStatus {
    // 件名に「当選」が含まれる場合は最優先で WON 判定
    if (subject?.includes('抽選申込当選のお知らせ') || subject?.includes('当選')) {
      return BOOKING_STATUS.WON
    }

    if (body.includes('抽選に当選されました')) return BOOKING_STATUS.WON
    if (body.includes('利用申込の手続きを完了')) return BOOKING_STATUS.CONFIRMED
    if (body.includes('キャンセル')) return BOOKING_STATUS.CANCELLED

    return BOOKING_STATUS.APPLIED // デフォルトまたは「抽選申込を受付けました」
  }

  /**
   * 正規表現の正規表現の各パーツを ISO8601 風の形式 (YYYY-MM-DD HH:mm) に変換する
   */
  private static formatDateRange(match: RegExpMatchArray): {
    eventDate: string
    eventEndDate: string
  } {
    const [_, year, rawMonth, rawDay, rawStart, rawEnd] = match

    // 1桁の月日や時間を 2桁（例: 03-09 09:00）に揃えるパディング
    const month = rawMonth.padStart(2, '0')
    const day = rawDay.padStart(2, '0')
    const startTime = rawStart.padStart(5, '0')
    const endTime = rawEnd.padStart(5, '0')

    return {
      eventDate: `${year}-${month}-${day} ${startTime}`,
      eventEndDate: `${year}-${month}-${day} ${endTime}`,
    }
  }
}
