import type { UserRow } from './repositories/types'
import type { GmailService } from './services/gmail'

export type Bindings = {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REFRESH_TOKEN: string
  ENCRYPTION_KEY: string
  JWT_SECRET: string
  gym_booking_db: D1Database
}

export type Variables = {
  jwtPayload: {
    sub: string
    email: string
  }
  user: UserRow
  gmail: GmailService
}
