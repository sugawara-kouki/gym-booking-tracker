import { Context } from 'hono'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogPayload {
  message: string
  level: LogLevel
  time: string
  requestId?: string
  userId?: string
  [key: string]: any
}

export class Logger {
  static info(c: Context | null, message: string, extra: Record<string, any> = {}) {
    this.log(c, 'info', message, extra)
  }

  static warn(c: Context | null, message: string, extra: Record<string, any> = {}) {
    this.log(c, 'warn', message, extra)
  }

  static error(c: Context | null, message: string, extra: Record<string, any> = {}) {
    if (extra.error instanceof Error) {
      extra.stack = extra.error.stack
      extra.error = extra.error.message
    }
    this.log(c, 'error', message, extra)
  }

  static debug(c: Context | null, message: string, extra: Record<string, any> = {}) {
    this.log(c, 'debug', message, extra)
  }

  private static log(c: Context | null, level: LogLevel, message: string, extra: Record<string, any>) {
    const payload: LogPayload = {
      time: new Date().toISOString(),
      level,
      message,
      requestId: c?.get('requestId'),
      userId: c?.get('user')?.id,
      ...extra
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
}
