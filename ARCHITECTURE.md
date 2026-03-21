# Gym Booking Tracker - システム設計・運用ガイド

本ドキュメントは、プロジェクトの全体構造、設計パターン、および運用・保守のためのルールをまとめたものです。

---

## 1. ディレクトリ構造

```text
src/
├── app.ts              # アプリケーションのエントリポイント、ミドルウェア・エラーハンドリングの定義
├── index.ts            # Cloudflare Workers のフェッチハンドラー
├── types.ts            # 共通の型定義（Bindings, Variables, AppRouteHandler）
├── routes/             # 【定義】APIのエンドポイントとバリデーション（OpenAPI）
│   ├── auth.ts         # Router: auth.schema と auth.handler を結びつける
│   ├── auth.schema.ts  # Definition: Zodスキーマと Route メタデータ
│   ├── poc.ts          # Router: poc.schema と poc.handler を結びつける
│   └── poc.schema.ts   # Definition: Zodスキーマと Route メタデータ
├── handlers/           # 【実装】Hono Handler の実体 (Contextを受け取る層)
│   ├── auth.handler.ts # 認証・OAuth処理の具体的なロジック
│   ├── error.handler.ts # グローバルエラーハンドリングの実装
│   └── poc.handler.ts  # PoC機能の具体的なロジック
├── middleware/         # Hono ミドルウェア
│   ├── auth.ts         # JWT検証 (checkJwt), ユーザー情報注入 (injectUser)
│   └── gmail.ts        # GmailService の初期化とトークン管理 (injectGmail)
├── services/           # ビジネスロジック
│   ├── gmail.ts        # Gmail API との通信、トークンリフレッシュ・キャッシュ制御
│   ├── parser.ts       # メール本文のスクレイピング・解析ロジック
│   └── sync-orchestrator.ts # Gmail取得、解析、DB保存の一連の流れを制御
├── repositories/       # データアクセス層
│   ├── index.ts        # Repository の初期化（Factory）
│   ├── types.ts        # テーブル定義・Repository インターフェース
│   └── d1/             # SQLite (D1) 向けの実装
└── utils/              # 共通ユーティリティ
    ├── crypto.ts       # AES-GCM によるトークンの暗号化・復号
    ├── error.ts        # エラーコード定義
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

### 3.1 レイヤードアーキテクチャの徹底
- **Routes (`*.schema.ts`)**: APIの仕様（パス、入力、出力）のみを記述します。
- **Handlers (`*.handler.ts`)**: `AppRouteHandler` を使用し、リクエストのパース、Serviceの呼び出し、レスポンスの返却を行います。Honoの `Context` に依存する処理はここまでに留めます。
- **Services**: `Context` に依存しない純粋なロジックを記述します。

### 3.2 認証とトークン管理
- **セッション保持**: ログイン成功時に独自 JWT を `auth_token` クッキー（HttpOnly, Secure, SameSite=Lax）にセットします。
- **Google 連携**: 
    - `refresh_token` は初回ログイン時に取得し、DB（`users`テーブル）に暗号化して保存します。
    - `access_token` は 1 時間有効ですが、高速化のため DB にキャッシュします。
    - `GmailService` は、キャッシュが切れている場合のみ Google OAuth エンドポイントへリフレッシュを要求します。

### 3.2 構造化ロギング
- API へのリクエスト、エラー、バックグラウンド処理のログはすべて **JSON 形式** で出力されます。
- `requestId` がすべてログに付帯するため、特定のリクエストに関わる一連の動作を追跡可能です。
- **出力方法**: `Logger.info(c, "message", { extra: "data" })` を使用してください。

### 3.3 エラーハンドリング
- `app.ts` の `app.onError` でエラーを集約管理しています。
- 各ルートやミドルウェアで個別の `try-catch` は極力避け、例外をスローすることでグローバルハンドラーに任せる設計です。
- ユーザーに返すエラーは `ERROR_CODES` に定義された定数を使用します。

---

## 4. 運用・保守コマンド

### データベース（D1）
マイグレーションの作成と適用：
```bash
# マイグレーションファイルの作成
npx wrangler d1 migrations create gym_booking_db <name>

# ローカル環境への適用
npx wrangler d1 migrations apply gym_booking_db --local

# 本番環境（Remote）への適用
npx wrangler d1 migrations apply gym_booking_db --remote
```

### テスト
`src/services/parser.ts` などのコアロジックを修正した際は、必ずテストを実行してください。
```bash
# 全テストの実行
npm test

# カバレッジの確認
npm test -- --coverage
```

### 開発用ダッシュボード（Swagger）
開発サーバー起動中、ブラウザで `/swagger` にアクセスすると、API エンドポイントの一覧とテスト実行が可能です。

---

## 5. 注意事項
- **環境変数**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY` が必要です。これらは `wrangler.toml` および本番環境の Secret に設定してください。
- **暗号化キー**: `ENCRYPTION_KEY` を変更すると、既存の保存済みトークンが復号できなくなるため、保守時には十分注意してください。
