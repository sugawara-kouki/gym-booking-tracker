## 1. 概要と共通設計

### 1.1 Type-Safe Routing (Zod OpenAPI)
本プロジェクトの API は [Hono Zod OpenAPI](https://hono.dev/examples/zod-openapi) を活用して構築されています。
- 全てのエンドポイントは型定義（Schema）に基づいており、リクエストバリデーションとレスポンスの型がコンパイルレベルで同期されています。
- 手動のドキュメント更新の代わりに、実装から自動生成される OpenAPI Spec を提供します。

### 1.2 ベースURL
- 本番・開発環境: `/api`
- Swagger UI (ドキュメント): `/swagger`

### 1.3 レスポンス形式
- 全てのレスポンスは JSON 形式。`success: boolean` をトップレベルに含みます。

---

## 2. 認証エンドポイント (Authentication)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/auth/login` | ログイン画面（HTML）を表示 |
| `GET` | `/auth/google` | Google OAuth2 認可画面へリダイレクト |
| `GET` | `/auth/google/callback` | Google からのコールバック処理 |
| `GET` | `/auth/logout` | ログアウト（Cookie削除） |
| `GET` | `/auth/success` | 認証成功後のダッシュボード（HTML） |

---

## 3. 主要エンドポイント

### 3.1 同期システム (Mail Synchronization)

- **`POST /sync/`**: バックグラウンドでのフル同期（取得+解析）を開始。
- **`GET /sync/:runId/status`**: 実行中の非同期ジョブの進行状況を取得。
- **`POST /sync/ingest`**: [Debug] メール取得のみ実行（`raw_emails` 保存）。
- **`POST /sync/parse-pending`**: [Debug] 未処理メールの解析のみ実行。
- **`DELETE /sync/data`**: [Debug] 現在のユーザー関連データを全削除。

### 3.2 予約管理 (Booking Management)

- **`GET /bookings`**: 解析済みの予約・当選情報一覧を取得。
- **`GET /bookings/:id`**: 予約詳細。
- **`PATCH /bookings/:id`**: ステータス更新（キャンセル等）。

---

## 4. エラー定義 (Error Schema)

全てのエラーレスポンスは以下の構造を持ちます。

- `400 BAD_REQUEST`: パラメータ不正。詳細を `error.message` に含む。
- `401 UNAUTHORIZED`: 認証が必要、または無効なセッション。
- `404 NOT_FOUND`: リソース不在。
- `500 INTERNAL_SERVER_ERROR`: 予期せぬエラー。
