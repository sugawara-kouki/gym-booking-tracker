# Gym Booking Tracker - システム設計・運用ガイド

本ドキュメントは、プロジェクトの全体構造、設計パターン、および運用・保守のためのルールをまとめたものです。

---

## 1. ディレクトリ構造

```text
src/
├── api/
│   └── index.ts        # API サブルーター (RPC 用 AppType エクスポート、エラーハンドリング適用)
├── routes/             # 【定義】APIのエンドポイントとバリデーション (OpenAPI)
│   ├── auth.ts / .schema.ts     # 認証関連のルート定義
│   ├── bookings.ts / .schema.ts # 予約データ取得関連のルート定義
│   └── sync.ts / .schema.ts     # メール同期・バッチ処理関連のルート定義
├── handlers/           # 【実装】Hono Handler の実体 (Contextを受け取る層)
│   ├── auth.handler.ts # 認証・OAuth処理の具体的なロジック
│   ├── bookings.handler.ts # 予約データ取得のロジック
│   ├── error.handler.ts # グローバルエラーハンドリングの実装
│   └── sync.handler.ts # Gmail 同期実行のロジック
├── middleware/         # Hono ミドルウェア
│   ├── auth.ts         # JWT検証 (checkJwt), 認証情報注入 (injectAuth)
│   ├── db.ts           # リポジトリ注入 (injectRepos)
│   └── gmail.ts        # GmailService の初期化とトークン管理 (injectGmail)
├── layouts/            # UI レイアウト (Hono/JSX)
├── pages/              # UI ページコンポーネント
├── renderer.tsx        # UI レンダリングミドルウェア
├── app.tsx             # メインアプリケーション定義 (API/UIの統合、グローバル計測)
├── index.ts            # Cloudflare Workers フェッチハンドラー
├── types.ts            # 共通の型定義
├── services/           # ビジネスロジック
│   ├── auth.ts         # ユーザー管理・JWT発行
│   ├── google-auth.ts  # Google OAuth2 トークン操作
│   ├── gmail.ts        # Gmail API との通信、トークンリフレッシュ・キャッシュ制御
│   ├── parser.ts       # メール本文のスクレイピング・解析ロジック
│   └── sync-orchestrator.ts # Gmail取得、解析、DB保存の一連の流れを制御
├── repositories/       # データアクセス層
│   ├── index.ts        # Repository の初期化（Factory）
│   ├── types.ts        # テーブル定義・Repository インターフェース
│   └── d1/             # SQLite (D1) 向けの実装
└── utils/              # 共通ユーティリティ
    ├── router.ts       # 【核心】ルーター・ファクトリ (型昇格とミドルウェアのセットアップ)
    ├── crypto.ts       # AES-GCM によるトークンの暗号化・復号
    ├── error.ts        # エラーコード定義
    ├── response.ts     # 共通レスポンス形式の定義
    └── logger.ts       # 構造化ロギングの実装
```

---

## 2. コア・テクノロジー

- **Framework**: [Hono](https://hono.dev/) (+ Zod OpenAPI)
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Authentication**: Google OAuth2 + JWT (HttpOnly Cookie)
- **Testing**: Vitest

---

## 3. 基本設計・コーディングルール

### 3.1 ルーター・ファクトリパターン
本プロジェクトでは、ミドルウェアの適用漏れを防ぎつつ、TypeScript の型安全性を最大化するため、`src/utils/router.ts` に定義されたファクトリ関数を使用してルーターを生成します。

- **`createGlobalRouter`**: 全体（API/UI）共通の基盤（ログ、RequestId、CORS、SecurityHeaders）。
- **`createAPIBaseRouter`**: リポジトリ注入（`injectRepos`）を備えた API 用ベース。
- **`createAuthRouter`**: 認証（`injectAuth`）を自動適用し、Context を `AuthenticatedVariables` に昇格。
- **`createGmailRouter`**: 認証 ＋ Gmail（`injectGmail`）を適用し、`AuthenticatedGmailVariables` に昇格。

### 3.2 認証とユーザー管理
- **型昇格（Type Promotion）**: 詳細は `DOCS_AUTH_ARCHITECTURE.md` を参照してください。
- **セッション保持**: アプリケーション独自の JWT を発行し、`auth_token` クッキー（HttpOnly, Secure, SameSite=Lax）に保持します。

### 3.3 エラーハンドリング
- **API エラー**: `src/api/index.ts` にて `onError(errorHandler)` を適用しています。これにより、API 呼び出しでのエラーは常に構造化された JSON 形式で返されます。
- **UI エラー**: メインの `app.tsx` または Hono デフォルトのハンドラーが処理を受け持ち、API と UI でエラーの出し分けを行っています。

---

## 4. 運用・保守コマンド

（略：以前の内容を維持）

---

## 5. 注意事項
（略：以前の内容を維持）
