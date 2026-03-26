# API インターフェース設計書

本ドキュメントでは、Gym Booking Tracker における API エンドポイントおよびデータ構造について定義する。

## 1. 共通定義

### 1.1 ベースURL
- `/api`

### 1.2 レスポンス形式
- 全てのレスポンスは JSON 形式とする。
- 成功時の例:
  ```json
  {
    "success": true,
    "data": { ... }
  }
  ```
- 失敗時の例:
  ```json
  {
    "success": false,
    "error": {
      "code": "ERROR_CODE",
      "message": "Human readable message"
    }
  }
  ```

---

## 2. エンドポイント定義

### 2.1 同期処理の開始 (Full Sync)
Cron やユーザー操作によってトリガーされ、Gmailからのメール取得と解析を行う。

- **Endpoint**: `POST /sync/`
- **概要**: バックグラウンドで Gmail から最新メールを取得（Ingest）し、データベースの未処理メールを解析（Parse）して予約情報に反映する一連の処理を非同期で開始する。
- **レスポンス**:
  ```json
  {
    "success": true,
    "data": {
      "runId": "uuid-string",
      "success": true
    }
  }
  ```

### 2.1.1 同期ステータス確認
- **Endpoint**: `GET /sync/:runId/status`
- **概要**: バックグラウンド実行中または完了した同期処理ステータスを取得する。
- **レスポンス**:
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid-string",
      "status": "success",
      "total_count": 10,
      "success_count": 10,
      "error_count": 0
    }
  }
  ```

### 2.2 予約情報一覧取得
- **Endpoint**: `GET /bookings`
- **概要**: 登録されている予約・当選情報の一覧を取得する。
- **クエリパラメータ**:
  - `status`: ステータスでのフィルタリング (optional)
  - `from`: 開始日 (optional)
  - `to`: 終了日 (optional)
- **レスポンス**:
  - `Array<{ id, facility_name, event_date, status, updated_at }>`

### 2.3 予約詳細取得
- **Endpoint**: `GET /bookings/:id`
- **概要**: 指定した予約の情報を取得する。

### 2.4 予約ステータス更新
- **Endpoint**: `PATCH /bookings/:id`
- **概要**: 予約ステータスを手動で更新（例：キャンセルへの変更）する。
- **リクエスト**:
  - `status`: 新しいステータス (enum)

### 2.5 [Debug] デバッグ・運用系エンドポイント
- **`POST /sync/ingest`**: Gmailから生メールを取り込む（Ingest）工程のみを実行し、`raw_emails` に保存する。
- **`POST /sync/parse-pending`**: DB内の未処理メール（`raw_emails`）を解析し、`bookings` に変換する工程のみを実行する。
- **`DELETE /sync/data`**: 開発・検証用にユーザーの全データ（同期ログ、予約データ等）をクリアする。

---

## 3. データ構造 (Schemas)

### 3.1 Booking Object
| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | string (UUID) | システム内の一意識別子 |
| `facility_name`| string | 体育館名（秘匿情報管理の対象） |
| `event_date` | string | 予約・当選の日時 |
| `court_info` | string | コート番号や部屋名 (optional) |
| `status` | string | ステータス (applied / won / confirmed / cancelled) |
| `raw_mail_id` | string | 解析元メールのID（冪等性確保用） |
| `created_at` | string | 登録日時 |
| `updated_at` | string | 最終更新日時 |

---

## 4. エラーコード定義
- `BAD_REQUEST`: リクエストパラメータ不正
- `NOT_FOUND`: 指定されたリソースが存在しない
- `INTERNAL_SERVER_ERROR`: サーバー内部エラー
