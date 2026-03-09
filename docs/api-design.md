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

### 2.1 メールの自動解析結果登録
メール解析用 Worker（または外部サービス）からの解析済みデータを受け取る。

- **Endpoint**: `POST /webhook/mail`
- **概要**: 解析済みの予約・当選情報を登録または更新する。
- **リクエスト**:
  - `facility_name`: 施設名 (string)
  - `event_date`: 日時 (ISO8601 string)
  - `status`: ステータス (enum: "applied", "won", "confirmed", "cancelled")
  - `raw_mail_id`: メールを一意に特定するID (string) - 冪等性のために使用

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

### 2.5 [Development] メール取得テスト (PoC)
- **Endpoint**: `GET /poc/emails`
- **概要**: 設定された認証情報を使用して、最新のメールリストを取得できるか確認する。
- **レスポンス**:
  ```json
  {
    "success": true,
    "data": {
      "messages": [ { "id": "...", "threadId": "..." } ]
    }
  }
  ```

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
