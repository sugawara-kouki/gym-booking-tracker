# 認証設計ガイド: Hono における「型昇格（Type Promotion）」アプローチ

本プロジェクトでは、Hono の型システムを最大限に活用した「型昇格（Type Promotion）」という手法を採用して認証を実装しています。これは、`hono/factory` の設計思想を `zod-openapi` の制約下で最適化したものです。

## 1. 解決した課題
これまでの実装（グローバルな変数定義に頼る手法）では、以下のリスクがありました：
- **ミドルウェアの設定漏れ**: ルーターで認証ミドルウェアを忘れても、ハンドラー側では「ユーザーが存在する（必須型）」と誤認され、実行時に `undefined.id` でクラッシュする。
- **冗長なチェック**: 安全のために各ハンドラーで `if (!user)` などのチェックを書くと、コード量が増え認知コストが上がる。

## 2. 「型昇格」アプローチの仕組み

### A. グローバル変数の安全化 (`src/types.ts`)
デフォルトの `Variables` 定義では、`user` を **オプショナル** に設定します。これにより、意図しない場所での安全性を確保します。
```typescript
export type Variables = {
  user?: UserRow; // デフォルトでは「いないかもしれない」
  // ...
}
```

### B. 認証済み専用の型定義 (`src/middleware/auth.ts`)
認証が保証された環境（ミドルウェア通過後）でのみ使用する、`user` を **必須** に上書きした型を定義します。
```typescript
export type AuthenticatedVariables = Variables & {
  user: UserRow; // ここで「型を昇格」させる
}
```

### C. 認証済みハンドラー型 (`src/types.ts`)
`zod-openapi` の `AppRouteHandler` を拡張し、最初から `AuthenticatedVariables` を備えたハンドラー型を用意します。
```typescript
export type AuthenticatedRouteHandler<T extends RouteConfig> = 
  RouteHandler<T, { Bindings: Bindings, Variables: AuthenticatedVariables }>;
```

## 3. 実装のベストプラクティス

### ルーターの定義
認証が必要なルートを一つのファイルにまとめ、そのルーター自体の型定義で `AuthenticatedVariables` を指定します。
```typescript
// src/routes/sync.ts
const app = new OpenAPIHono<{ Bindings: Bindings, Variables: AuthenticatedVariables }>();

// 必須：ミドルウェアを適用することで、実際のデータと型を同期させる
app.use('*', authMiddleware);
```

### ハンドラーの定義
`AuthenticatedRouteHandler` を使うだけで、`c.get('user')` がチェック不要の必須型として扱えます。
```typescript
// src/handlers/sync.handler.ts
export const syncHandler: AuthenticatedRouteHandler<typeof syncRoute> = async (c) => {
  const user = c.get('user'); // 型は UserRow (必須)
  // ...
}
```

## 4. なぜ `hono/factory` 直使い（createHandlers）ではないのか？
Hono の `factory.createHandlers` は配列を返すため、`zod-openapi` の `app.openapi(route, handler)` メソッド（単一の関数を期待する）と型の相性が悪いためです。

今回採用した「型昇格」アプローチは、`factory` が目指す **「ミドルウェアと型の一貫性」** を、ルーターレベルのスコープでより強力かつクリーンに実現した手法です。

---
**Tip**: 新しい認証必須ルートを追加する際は、`AuthenticatedRouteHandler` を使用し、対応するルーターで必ず `authMiddleware` を `app.use` するようにしてください。設定を忘れた場合は、TypeScript がコンパイルエラーとして教えてくれます。

## 5. 応用例: Gmail 連携の型昇格
認証だけでなく、特定の外部サービス連携（Gmail など）が必要なルートに対しても同様の手法を適用できます。

### A. 型定義の拡張 (`src/middleware/gmail.ts`)
```typescript
export type AuthenticatedGmailVariables = AuthenticatedVariables & {
  gmail: GmailService; // Google 連携済みであることを保証
}
```

### B. ルーターでの段階的な昇格 (`src/routes/sync.ts`)
```typescript
// 認証のみ必要なルート
const app = new OpenAPIHono<{ Variables: AuthenticatedVariables }>();
app.use('*', authMiddleware);

// さらに Gmail も必要なルート専用のサブルーター
const gmailApp = new OpenAPIHono<{ Variables: AuthenticatedGmailVariables }>();
gmailApp.use('*', injectGmail);

gmailApp.openapi(syncRoute, syncHandler); // syncHandler は AuthenticatedGmailRouteHandler を使用
app.route('/', gmailApp);
```

このように、ルーターをネストさせることで、各ハンドラーが「本当に必要としているリソース」を型レベルで正確に表現できます。
