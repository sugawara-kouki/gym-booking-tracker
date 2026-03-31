import { describe, expect, it } from 'vitest'
import { BOOKING_STATUS, EmailParser } from './parser'

describe('EmailParser', () => {
  describe('parse', () => {
    it('should parse a standard booking application (APPLIED)', () => {
      const body = `
                【受付番号】123456-78
                【施設室場】中央体育館 競技場
                【利用日時】2024年10月15日(火)18:00～21:00
                【利用目的】バスケットボール
                抽選申込を受付けました。
            `.trim()
      const result = EmailParser.parse(body)
      expect(result).not.toBeNull()
      expect(result?.facility_name).toBe('中央体育館 競技場')
      expect(result?.event_date).toBe('2024-10-15 18:00')
      expect(result?.event_end_date).toBe('2024-10-15 21:00')
      expect(result?.registration_number).toBe('123456-78')
      expect(result?.purpose).toBe('バスケットボール')
      expect(result?.status).toBe(BOOKING_STATUS.APPLIED)
    })

    it('should parse a lottery win notification (WON) from subject', () => {
      const body = '【施設室場】北体育館 体育室\n【利用日時】2024年11月20日(水)09:00～12:00'
      const result = EmailParser.parse(body, '抽選申込当選のお知らせ')
      expect(result?.status).toBe(BOOKING_STATUS.WON)
    })

    it('should parse a lottery win notification (WON) from body text', () => {
      const body =
        '【施設室場】北体育館 体育室\n【利用日時】2024年11月20日(水)09:00～12:00\n抽選に当選されました。'
      const result = EmailParser.parse(body)
      expect(result?.status).toBe(BOOKING_STATUS.WON)
    })

    it('should parse a confirmed booking (CONFIRMED)', () => {
      const body = `
                【受付番号】112233
                【施設室場】西体育館 競技場
                【利用日時】2024年12月01日(日)13:00～15:00
                利用申込の手続きを完了しました。
            `.trim()
      const result = EmailParser.parse(body)
      expect(result?.status).toBe(BOOKING_STATUS.CONFIRMED)
    })

    it('should parse a cancelled booking (CANCELLED)', () => {
      const body = `
                【受付番号】445566
                【施設室場】東体育館 競技場
                【利用日時】2024年12月24日(火)19:00～21:00
                予約をキャンセルしました。
            `.trim()
      const result = EmailParser.parse(body)
      expect(result?.status).toBe(BOOKING_STATUS.CANCELLED)
    })

    it('should handle single digit month and day with zero-padding', () => {
      const body = `
                【受付番号】778899
                【施設室場】南体育館 競技場
                【利用日時】2024年3月9日(土)09:00～11:00
            `.trim()
      const result = EmailParser.parse(body)
      expect(result?.event_date).toBe('2024-03-09 09:00')
      expect(result?.event_end_date).toBe('2024-03-09 11:00')
    })

    it('should return null if essential fields are missing', () => {
      const body = '不正なメール形式です'
      const result = EmailParser.parse(body)
      expect(result).toBeNull()
    })

    it('should return null if facility name is missing', () => {
      const body = '【利用日時】2024年10月15日(火)18:00～21:00'
      const result = EmailParser.parse(body)
      expect(result).toBeNull()
    })

    it('should return null if date is missing', () => {
      const body = '【施設室場】中央体育館 競技場'
      const result = EmailParser.parse(body)
      expect(result).toBeNull()
    })
  })
})
