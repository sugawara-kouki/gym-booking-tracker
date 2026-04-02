import { BOOKING_STATUS, type BookingStatus } from '../../constants/status'
import type { EmailParserProvider, ParsedBooking } from './base'

/**
 * 札幌市公共施設予約システムからのメールを解析するプロバイダーを作成します。
 * (Factory Function スタイル)
 */
export const createSapporoParser = (): EmailParserProvider => {
  const name = 'sapporo'

  // 解析用の内部ユーティリティ（クロージャ内に隠蔽）
  const REGEX = {
    FACILITY: /【施設室場】(.*)/,
    DATE: /【利用日時】(\d{4})年(\d{1,2})月(\d{1,2})日\(.\)(\d{1,2}:\d{2})～(\d{1,2}:\d{2})/,
    REG_NO: /【受付番号】([\d-]+)/,
    PURPOSE: /【利用目的】(.*)/,
  } as const

  const determineStatus = (body: string, subject?: string): BookingStatus => {
    if (subject?.includes('抽選申込当選のお知らせ') || subject?.includes('当選')) {
      return BOOKING_STATUS.WON
    }
    if (body.includes('抽選に当選されました')) return BOOKING_STATUS.WON
    if (body.includes('利用申込の手続きを完了')) return BOOKING_STATUS.CONFIRMED
    if (body.includes('キャンセル')) return BOOKING_STATUS.CANCELLED
    return BOOKING_STATUS.APPLIED
  }

  const formatDateRange = (match: RegExpMatchArray) => {
    const [_, year, rawMonth, rawDay, rawStart, rawEnd] = match
    const month = rawMonth.padStart(2, '0')
    const day = rawDay.padStart(2, '0')
    return {
      eventDate: `${year}-${month}-${day} ${rawStart.padStart(5, '0')}`,
      eventEndDate: `${year}-${month}-${day} ${rawEnd.padStart(5, '0')}`,
    }
  }

  return {
    name,
    canParse(body: string, subject?: string): boolean {
      return (
        (subject?.includes('札幌市公共施設予約システム') ?? false) ||
        (body.includes('札幌市公共施設予約システム') && body.includes('【施設室場】')) ||
        (body.includes('【施設室場】') && body.includes('【利用日時】'))
      )
    },
    parse(body: string, subject?: string): ParsedBooking | null {
      const facilityMatch = body.match(REGEX.FACILITY)
      const dateMatch = body.match(REGEX.DATE)

      if (!facilityMatch || !dateMatch) return null

      const status = determineStatus(body, subject)
      const { eventDate, eventEndDate } = formatDateRange(dateMatch)

      return {
        facility_name: facilityMatch[1].trim(),
        event_date: eventDate,
        event_end_date: eventEndDate,
        registration_number: body.match(REGEX.REG_NO)?.[1].trim(),
        purpose: body.match(REGEX.PURPOSE)?.[1].trim(),
        status,
      }
    },
  }
}
