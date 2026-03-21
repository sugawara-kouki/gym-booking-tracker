import { getCookie, setCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'
import { createRepositories } from '../repositories'
import { encryptToken } from '../utils/crypto'
import type { AppRouteHandler } from '../types'
import { 
  loginRoute, 
  googleAuthRoute, 
  googleCallbackRoute, 
  successRoute, 
  logoutRoute,
  GoogleTokenResponseSchema,
  GoogleUserInfoSchema 
} from '../routes/auth.schema'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

/**
 * ログイン画面（HTML）を表示するハンドラー
 */
export const loginHandler: AppRouteHandler<typeof loginRoute> = (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <title>ログイン - Gym Booking Tracker</title>
      <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5;}
        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
        .btn { display: inline-block; background: #4285F4; color: white; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; margin-top: 20px;}
        .btn:hover { background: #357ae8; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Gym Booking Tracker</h2>
        <p>予約メールを自動同期するためにログインしてください</p>
        <a href="/auth/google" class="btn">Googleでログイン</a>
      </div>
    </body>
    </html>
  `)
}

/**
 * Google OAuth の認可画面へリダイレクトするハンドラー
 */
export const googleAuthHandler: AppRouteHandler<typeof googleAuthRoute> = (c) => {
  const url = new URL(c.req.url)
  const redirectUri = `${url.protocol}//${url.host}/auth/google/callback`
  
  // CSRF対策用の一時的なステートを生成し Cookie に保存
  const state = crypto.randomUUID()
  setCookie(c, 'oauth_state', state, { httpOnly: true, secure: true, maxAge: 60 * 10 })
  
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    // gmail.readonly 権限を要求
    scope: 'openid profile email https://www.googleapis.com/auth/gmail.readonly',
    // リフレッシュトークンを取得するため必須設定
    access_type: 'offline',
    // 常に同意画面を表示させることで、リフレッシュトークンの再発行を確実にする手法
    prompt: 'consent',
    state: state
  })
  
  return c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)
}

/**
 * Googleからのコールバックを受け取り、認証を完了させるハンドラー
 */
export const googleCallbackHandler: AppRouteHandler<typeof googleCallbackRoute> = async (c) => {
  const url = new URL(c.req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  
  if (error) {
    return c.text(`認証エラーが発生しました: ${error}`, 400)
  }
  
  // 以前生成した state と比較して CSRF 攻撃を防ぐ
  const savedState = getCookie(c, 'oauth_state')
  if (!code || !state || state !== savedState) {
    return c.text('不正なリクエストです (State不一致 または Codeなし)', 400)
  }
  
  const redirectUri = `${url.protocol}//${url.host}/auth/google/callback`

  // 認可コードをアクセストークン等と交換
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })
  
  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    throw new Error(`Failed to exchange token: ${err}`)
  }

  const tokenData = await tokenResponse.json()
  const tokens = GoogleTokenResponseSchema.parse(tokenData)

  // アクセストークンを使用してユーザーの基本情報を取得
  const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  })
  const userInfoData = await userInfoResponse.json()
  const userInfo = GoogleUserInfoSchema.parse(userInfoData)
  
  const repos = createRepositories(c.env.gym_booking_db)
  
  // refresh_token が返ってきた場合のみ暗号化して保存（2回目以降のログインでは返ってこない場合がある）
  let encryptedRefreshToken = null;
  if (tokens.refresh_token) {
    encryptedRefreshToken = await encryptToken(tokens.refresh_token, c.env.ENCRYPTION_KEY)
  }

  // ユーザー情報の保存。既存ユーザーの場合は、取得できた場合のみ refresh_token を更新する
  const existingUser = await repos.users.findById(userInfo.id)
  await repos.users.upsert({
    id: userInfo.id,
    email: userInfo.email,
    name: userInfo.name || 'Unknown',
    refresh_token_encrypted: encryptedRefreshToken || (existingUser?.refresh_token_encrypted || null),
    // パフォーマンス向上のため短期的なアクセストークンもキャッシュ
    access_token_encrypted: await encryptToken(tokens.access_token, c.env.ENCRYPTION_KEY),
    access_token_expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in
  })

  // アプリケーション独自のセッション管理用 JWT を発行
  const payload = {
    sub: userInfo.id,
    email: userInfo.email,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // 7日間有効
  }
  const sessionToken = await sign(payload, c.env.JWT_SECRET)
  
  // セキュアな HttpOnly Cookie に JWT を保存
  setCookie(c, 'auth_token', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 7
  })
  
  // URLから機密パラメータを取り除くため、成功画面へリダイレクト
  return c.redirect('/auth/success')
}

/**
 * 認証成功後のダッシュボード画面（HTML）を表示するハンドラー
 */
export const successHandler: AppRouteHandler<typeof successRoute> = (c) => {
  const user = c.get('user')
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <title>認証成功 - Gym Booking Tracker</title>
      <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f2f5;}
        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
        .btn { display: inline-block; background: #4285F4; color: white; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; margin-top: 10px;}
        .btn.secondary { background: #6c757d; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>認証成功！</h2>
        <p>${user.name}さん、ようこそ。</p>
        <p>APIの準備が整いました。このままPoCのエンドポイントなどを利用可能です。</p>
        <div style="margin-top: 20px;">
          <a href="/swagger" class="btn">Swagger UIを確認する</a><br>
          <a href="/auth/logout" class="btn secondary" style="margin-top: 10px;">ログアウト</a>
        </div>
      </div>
    </body>
    </html>
  `)
}

/**
 * ログアウト処理を行い Cookie を削除するハンドラー
 */
export const logoutHandler: AppRouteHandler<typeof logoutRoute> = (c) => {
  // 認証 Cookie を無効化
  setCookie(c, 'auth_token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 0,
    expires: new Date(0)
  })
  setCookie(c, 'oauth_state', '', {
    httpOnly: true,
    secure: true,
    maxAge: 0,
    expires: new Date(0)
  })
  return c.redirect('/auth/login')
}
