import { sign } from 'hono/jwt'
import type { Repositories } from '../repositories'
import { encryptToken } from '../utils/crypto'

/**
 * プロバイダー（Google, Apple等）に依存しない抽象化されたプロフィール
 */
export interface AuthProfile {
  provider: string // 'google', 'apple' など
  id: string // プロバイダー側での一意な ID
  email: string
  name: string
}

/**
 * プロバイダーから提供されるトークン情報の共通インターフェース
 */
export interface AuthTokens {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
}

/**
 * AuthService が管理するユーザー情報の型
 */
export interface AuthUser {
  id: string
  provider: string
  provider_user_id: string
  email: string
  name: string
  refresh_token_encrypted: string | null
  access_token_encrypted: string
  access_token_expires_at: number
}

/**
 * ユーザーの認証、登録、セッション管理を担当するサービスのインターフェース
 */
export interface AuthService {
  loginOrUpdateUser(profile: AuthProfile, tokens: AuthTokens): Promise<AuthUser>
  createSessionToken(user: { id: string; email: string }): Promise<string>
}

/**
 * AuthService のファクトリ関数
 * 特定のプロバイダー（Google等）に依存しない設計にしています。
 */
export const createAuthService = (
  repos: Repositories,
  encryptionKey: string,
  jwtSecret: string,
): AuthService => {
  return {
    /**
     * 外部プロバイダーから取得したプロフィールとトークンをもとに、ユーザー情報を保存・更新する
     */
    async loginOrUpdateUser(profile: AuthProfile, tokens: AuthTokens) {
      // まずプロバイダー名とプロバイダー側の ID で既存ユーザーを探す
      const existingUser = await repos.users.findByProviderId(profile.provider, profile.id)

      // 新規ユーザーの場合は内部 ID (UUID) を発行、既存ならその ID を継続
      const internalId = existingUser ? existingUser.id : crypto.randomUUID()

      // リフレッシュトークンは初回のみ送られてくるケースがあるため取得時のみ更新、
      // そうでない場合は既存のものを破棄せずに維持する
      let encryptedRefreshToken = null
      if (tokens.refreshToken) {
        encryptedRefreshToken = await encryptToken(tokens.refreshToken, encryptionKey)
      }

      const userData = {
        id: internalId,
        provider: profile.provider,
        provider_user_id: profile.id,
        email: profile.email,
        name: profile.name,
        refresh_token_encrypted:
          encryptedRefreshToken || existingUser?.refresh_token_encrypted || null,
        // 短期的なアクセストークンも再利用・リフレッシュ抑制のためにキャッシュ
        access_token_encrypted: await encryptToken(tokens.accessToken, encryptionKey),
        access_token_expires_at: tokens.expiresIn
          ? Math.floor(Date.now() / 1000) + tokens.expiresIn
          : existingUser?.access_token_expires_at || 0,
      }

      // ON CONFLICT(provider, provider_user_id) に基づいて upsert される
      await repos.users.upsert(userData)
      return userData
    },

    /**
     * ユーザー情報に基づき、アプリケーション独自のセッション JWT を発行する
     */
    async createSessionToken(user: { id: string; email: string }) {
      const payload = {
        sub: user.id, // 内部 ID (UUID) をサブジェクトにする
        email: user.email,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7日間有効
      }
      return await sign(payload, jwtSecret)
    },
  }
}
