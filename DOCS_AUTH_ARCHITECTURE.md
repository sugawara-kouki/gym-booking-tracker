# 認証設計ガイド: Hono における「型昇格（Type Promotion）」アプローチ

本プロジェクトでは、Hono の型システムを最大限に活用した「型昇格（Type Promotion）」という手法を採用して認証を実装しています。これは、`hono/factory` の設計思想を `zod-openapi` の制約下で最適化したものです。

## 1. 解決した課題
これまでの実装（グローバルな変数定義に頼る手法）では、以下のリスクがありました：
- **ミドルウェアの設定漏れ**: ルーターで認証ミドルウェア（`injectAuth`）を忘れても、ハンドラー側では「ユーザーが存在する（必須型）」と誤認され、実行時に `undefined.id` でクラッシュする。
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

## 3. 実装のベストプラクティス：ルーター・ファクトリ

設定漏れを完全に防ぎ、認識容易性を高めるため、ルーターの作成には専用の**ファクトリ関数**（`src/utils/router.ts`）を使用します。

### ルーターの定義
認証や特定の依存関係が必要な場合、それに対応するファクトリを使用します。

```typescript
import { createAuthRouter, createGmailRouter } from '../utils/router'

// 認証が必須なルート
const app = createAuthRouter();

// Gmail 連携まで必須なルート
const gmailApp = createGmailRouter();
```

これらを使用することで、**「型の昇格」と「ミドルウェアの適用」がアトミック（不可分）**になり、設定漏れが物理的に発生しなくなります。

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

今回採用した「型昇格」と「ルーター・ファクトリ」の組み合わせは、`factory` が目指す **「ミドルウェアと型の一貫性」** を、`zod-openapi` の制約下でよりクリーンに実現した手法です。

---
**Tip**: 新しい認証必須ルートを追加する際は、必ず `createAuthRouter()` を使用してください。これにより必要なミドルウェアが自動的に適用され、型チェックも正しく機能します。
