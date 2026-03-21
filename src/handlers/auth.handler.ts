import { getCookie, setCookie } from 'hono/cookie'
import { GoogleAuthService } from '../services/google-auth'
import { AuthService } from '../services/auth'
import type { AppRouteHandler } from '../types'
import { 
  loginRoute, 
  googleAuthRoute, 
  googleCallbackRoute, 
  successRoute, 
  logoutRoute
} from '../routes/auth.schema'

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
  
  const googleAuth = new GoogleAuthService(c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET)
  const authUrl = googleAuth.getAuthUrl(redirectUri, state)
  
  return c.redirect(authUrl)
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
  const googleAuth = new GoogleAuthService(c.env.GOOGLE_CLIENT_ID, c.env.GOOGLE_CLIENT_SECRET)
  const authService = new AuthService(c.get('repos'), c.env.ENCRYPTION_KEY, c.env.JWT_SECRET)

  // 認可コードをトークンと交換 (プロバイダー固有の処理)
  const tokens = await googleAuth.exchangeCodeForTokens(code, redirectUri)

  // アクセストークンを使用してプロフィール取得 (プロバイダー固有の処理)
  const profile = await googleAuth.fetchUserInfo(tokens.access_token)
  
  // ユーザー情報の保存・更新 (汎用インターフェースへのマッピング)
  const user = await authService.loginOrUpdateUser(
    {
      id: profile.id,
      email: profile.email,
      name: profile.name || 'Unknown'
    },
    {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in
    }
  )

  // アプリケーション独自のセッション管理用 JWT を発行
  const sessionToken = await authService.createSessionToken({ id: user.id, email: user.email })
  
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
