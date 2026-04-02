import type { BookingStatus } from '../../constants/status'

/**
 * 抽出された予約情報の型
 */
export interface ParsedBooking {
  facility_name: string
  event_date: string // YYYY-MM-DD HH:mm
  event_end_date?: string
  registration_number?: string
  purpose?: string
  court_info?: string
  status: BookingStatus
}

/**
 * 特定の施設のメール形式に対応するパーサーのインターフェース
 */
export interface EmailParserProvider {
  /** プロバイダー名（デバッグ・ログ用） */
  readonly name: string
  /**
   * 指定されたメールがこのプロバイダーの対象かどうかを判定する
   */
  canParse(body: string, subject?: string): boolean
  /**
   * メールの解析を実行する
   */
  parse(body: string, subject?: string): ParsedBooking | null
}
