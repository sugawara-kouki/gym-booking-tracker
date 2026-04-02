/**
 * メールの予約解析ステータス
 */
export const PARSE_STATUS = {
  PENDING: 'pending', // 未処理
  SUCCESS: 'success', // 解析成功
  FAIL: 'fail', // 解析失敗（エラー）
  SKIPPED: 'skipped', // 解析対象外（予約メールではない）
} as const

export type ParseStatus = (typeof PARSE_STATUS)[keyof typeof PARSE_STATUS]

/**
 * 施設の予約状況（ステータス）
 */
export const BOOKING_STATUS = {
  APPLIED: 'applied', // 抽選申込中
  WON: 'won', // 当選（未確定）
  CONFIRMED: 'confirmed', // 予約確定
  CANCELLED: 'cancelled', // キャンセル
} as const

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS]

/**
 * 同期バッチの実行ステータス
 */
export const SYNC_RUN_STATUS = {
  RUNNING: 'running',
  SUCCESS: 'success',
  PARTIAL_SUCCESS: 'partial_success', // 一部の処理でエラーが発生
  FAILURE: 'failure',
} as const

export type SyncRunStatus = (typeof SYNC_RUN_STATUS)[keyof typeof SYNC_RUN_STATUS]
