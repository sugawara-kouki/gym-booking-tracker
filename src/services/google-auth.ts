import { GoogleTokenResponseSchema, GoogleUserInfoSchema } from '../routes/auth.schema'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

/**
 * Google OAuth2 API との対話を直接管理するサービス層
 */
export class GoogleAuthService {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  /**
   * Google の認可画面へリダイレクトするための URL を生成する
   */
  getAuthUrl(redirectUri: string, state: string) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  /**
   * 認可コードをアクセストークンおよびリフレッシュトークンと交換する
   */
  async exchangeCodeForTokens(code: string, redirectUri: string) {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Failed to exchange token: ${err}`)
    }

    const data = await response.json()
    return GoogleTokenResponseSchema.parse(data)
  }

  /**
   * アクセストークンを使用してプロフィール情報を取得する
   */
  async fetchUserInfo(accessToken: string) {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Failed to fetch user info: ${err}`)
    }

    const data = await response.json()
    return GoogleUserInfoSchema.parse(data)
  }
}
