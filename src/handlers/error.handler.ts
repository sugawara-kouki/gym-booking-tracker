import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Bindings, Variables } from '../types'
import { ERROR_CODES } from '../utils/error'
import { Logger } from '../utils/logger'

/**
 * アプリケーション全体の予期せぬエラーをキャッチして整形するグローバルハンドラー
 */
export const errorHandler: ErrorHandler<{ Bindings: Bindings; Variables: Variables }> = (
  err,
  c,
) => {
  // 構造化ログにエラー詳細を記録（requestId も付帯される）
  Logger.error(c, 'Unhandled exception occurred', { error: err })

  // Hono の HTTPException (abort, 認証エラーなど) の場合
  if (err instanceof HTTPException) {
    // 独自レスポンスがあらかじめ設定されている場合はそれを優先
    if (err.res) return err.res

    // それ以外は HTTPException のステータスコードを尊重しつつ JSON 形式に整形
    return c.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: err.message,
        },
      },
      err.status,
    )
  }

  // それ以外の一般的な Error や未知の例外は 500 (Internal Server Error) として扱う
  return c.json(
    {
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: err instanceof Error ? err.message : 'Internal Server Error',
      },
    },
    500,
  )
}
