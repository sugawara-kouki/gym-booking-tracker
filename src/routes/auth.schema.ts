import { createRoute, z } from '@hono/zod-openapi'

// --- Schemas for Google API Responses ---

export const GoogleTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string(),
  token_type: z.string(),
  id_token: z.string().optional(),
})

export const GoogleUserInfoSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  verified_email: z.boolean(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  picture: z.string().url().optional(),
  locale: z.string().optional(),
})

// --- Routes configuration ---

export const loginRoute = createRoute({
  method: 'get',
  path: '/login',
  summary: 'Login page UI',
  description: 'ユーザーログイン用のHTML画面を表示します',
  responses: {
    200: {
      description: 'Login page HTML',
      content: { 'text/html': { schema: z.string() } }
    }
  }
})

export const googleAuthRoute = createRoute({
  method: 'get',
  path: '/google',
  summary: 'Redirect to Google OAuth',
  description: 'Googleの認可画面（OAuth同意画面）へリダイレクトします',
  responses: {
    302: { description: 'Redirect to Google' }
  }
})

export const googleCallbackRoute = createRoute({
  method: 'get',
  path: '/google/callback',
  summary: 'Google OAuth Callback',
  description: 'Googleからの認可コードを受け取り、トークン交換とログイン処理を完了させます',
  responses: {
    302: {
      description: 'Redirect to success page'
    },
    400: {
      description: 'Invalid request (state mismatch or missing code)',
      content: { 'text/plain': { schema: z.string() } }
    },
    500: {
      description: 'Authentication failed',
      content: { 'text/html': { schema: z.string() } }
    }
  }
})

export const successRoute = createRoute({
  method: 'get',
  path: '/success',
  summary: 'Authentication Success Page',
  description: '認証成功後のクリーンなURLの画面を表示します',
  responses: {
    200: {
      description: 'Success page HTML',
      content: { 'text/html': { schema: z.string() } }
    }
  }
})

export const logoutRoute = createRoute({
  method: 'get',
  path: '/logout',
  summary: 'Logout',
  description: '認証Cookieを削除してログアウトします',
  responses: {
    302: { description: 'Redirect to login page' }
  }
})
