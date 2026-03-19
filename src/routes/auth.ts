import { OpenAPIHono } from '@hono/zod-openapi'
import { getCookie, setCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'
import { createRepositories } from '../repositories'
import { encryptToken } from '../utils/crypto'
import type { Bindings, Variables } from '../types'

export const auth = new OpenAPIHono<{ Bindings: Bindings, Variables: Variables }>()

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

// PoC用のログイン画面
auth.get('/login', (c) => {
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
})

// Google 認可画面へのリダイレクト
auth.get('/google', (c) => {
  const url = new URL(c.req.url)
  const redirectUri = `${url.protocol}//${url.host}/auth/google/callback`
  
  // CSRF対策用のstate
  const state = crypto.randomUUID()
  setCookie(c, 'oauth_state', state, { httpOnly: true, secure: true, maxAge: 60 * 10 }) // 10分有効
  
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline', // リフレッシュトークンを取得するため必須
    prompt: 'consent',      // 毎回同意画面を出してリフレッシュトークンを確実にもらう
    state: state
  })
  
  return c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)
})

// Googleからのコールバック
auth.get('/google/callback', async (c) => {
  const url = new URL(c.req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  
  if (error) {
    return c.text(`認証エラーが発生しました: ${error}`, 400)
  }
  
  const savedState = getCookie(c, 'oauth_state')
  if (!code || !state || state !== savedState) {
    return c.text('不正なリクエストです (State不一致 または Codeなし)', 400)
  }
  
  const redirectUri = `${url.protocol}//${url.host}/auth/google/callback`

  try {
    // 1. 認可コードをトークンと交換
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

    const tokens = await tokenResponse.json() as any
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token // prompt=consent なので基本的についてくるはず

    // 2. ユーザー情報を取得
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const userInfo = await userInfoResponse.json() as any
    
    // 3. データベースへ保存 (リフレッシュトークン含め)
    const repos = createRepositories(c.env.gym_booking_db)
    
    // refresh_token が送られてこない場合もあるため（過去に同意済みの場合など）、存在する場合のみ暗号化
    let encryptedRefreshToken = null;
    if (refreshToken) {
        encryptedRefreshToken = await encryptToken(refreshToken, c.env.ENCRYPTION_KEY)
    }

    // ユーザー情報のUpsert（既存ユーザーの場合はリフレッシュトークンが新たに取れたら更新）
    const existingUser = await repos.users.findById(userInfo.id)
    await repos.users.upsert({
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name || 'Unknown',
        refresh_token_encrypted: encryptedRefreshToken || (existingUser?.refresh_token_encrypted || null)
    })

    // 4. APIアクセス用のセッション(JWT)を発行し、HttpOnly Cookieにセット
    const payload = {
      sub: userInfo.id,
      email: userInfo.email,
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // 7日間有効
    }
    const sessionToken = await sign(payload, c.env.JWT_SECRET)
    
    setCookie(c, 'auth_token', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 7
    })
    
    // 認証完了
    return c.html(`
      <!DOCTYPE html>
      <html lang="ja">
      <body>
        <div style="text-align:center; margin-top: 50px; font-family: sans-serif;">
          <h2>認証成功！</h2>
          <p>${userInfo.name}さん、ようこそ。</p>
          <p>APIの準備が整いました。このままPoCのエンドポイントなどを利用可能です。</p>
          <a href="/doc">Swagger UIを確認する</a>
        </div>
      </body>
      </html>
    `)
    
  } catch (e: any) {
    console.error('Google Auth Error:', e)
    return c.text(`認証処理中にエラーが発生しました: ${e.message}`, 500)
  }
})
