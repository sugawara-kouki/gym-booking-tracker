import type { Context } from 'hono'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogPayload {
  message: string
  level: LogLevel
  time: string
  requestId?: string
  userId?: string
  [key: string]: unknown
}

const log = (
  c: Context | null,
  level: LogLevel,
  message: string,
  extra: Record<string, unknown>,
): void => {
  const payload: LogPayload = {
    time: new Date().toISOString(),
    level,
    message,
    requestId: c?.get('requestId'),
    userId: c?.get('user')?.id,
    ...extra,
  }

  const output = JSON.stringify(payload)
  if (level === 'error') {
    console.error(output)
  } else if (level === 'warn') {
    console.warn(output)
  } else {
    console.log(output)
  }
}

/**
 * ログ出力を担当するユーティリティ
 */
export const Logger = {
  info(c: Context | null, message: string, extra: Record<string, unknown> = {}) {
    log(c, 'info', message, extra)
  },

  warn(c: Context | null, message: string, extra: Record<string, unknown> = {}) {
    log(c, 'warn', message, extra)
  },

  error(c: Context | null, message: string, extra: Record<string, unknown> = {}) {
    const logExtra = { ...extra }
    if (logExtra.error instanceof Error) {
      logExtra.stack = logExtra.error.stack
      logExtra.error = logExtra.error.message
    }
    log(c, 'error', message, logExtra)
  },

  debug(c: Context | null, message: string, extra: Record<string, unknown> = {}) {
    log(c, 'debug', message, extra)
  },
}
