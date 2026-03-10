# データベース設計書 (Cloudflare D1)

本ドキュメントでは、Gym Booking Tracker におけるデータの永続化レイヤー（Cloudflare D1 / SQLite）の最終設計について定義する。

## 1. 設計方針
- **SQLiteへの最適化**: 文字列データには、ストレージ効率と柔軟性に優れた `TEXT` 型を全面的に採用する。
- **冪等性の担保**: `raw_mail_id`（Gmail Message ID）をユニークキーとし、同一データの重複登録をデータベース層で防止する。
- **検索の高速化**: ユーザーがダッシュボードで利用する「日付順」「施設別」「ステータス別」の検索を高速化するためのインデックスを配置する。

---

## 2. テーブル定義

### 2.1 `bookings` テーブル
個別の施設予約・当選情報を管理する。

| カラム名 | 型 | 制約 | 説明 |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | システム内一意識別子 (UUID) |
| `facility_name` | TEXT | NOT NULL | 施設名 (例: 幌東小学校 体育館) |
| `event_date` | TEXT | NOT NULL | 利用開始日時 (ISO8601形式: YYYY-MM-DD HH:mm) |
| `event_end_date` | TEXT | - | 利用終了日時 (ISO8601形式: YYYY-MM-DD HH:mm) |
| `registration_number`| TEXT | - | 受付番号 (例: 20250337014274-1) |
| `purpose` | TEXT | - | 利用目的 (例: バドミントン) |
| `court_info` | TEXT | - | コート番号、部屋名、種目などの詳細 |
| `status` | TEXT | NOT NULL | ステータス (applied: 申込, won: 当選, confirmed: 確定, cancelled: 取消) |
| `raw_mail_id` | TEXT | UNIQUE, NOT NULL | 重複排除用の Gmail メッセージ ID |
| `created_at` | INTEGER | DEFAULT (unixepoch()) | 登録日時 (Unix Epoch) |
| `updated_at` | INTEGER | DEFAULT (unixepoch()) | 最終更新日時 (Unix Epoch) |

### 2.2 `sync_logs` テーブル
Gmail同期処理（Cron）の実行状態と結果を管理する。

| カラム名 | 型 | 制約 | 説明 |
| :--- | :--- | :--- | :--- |
| `id` | TEXT | PRIMARY KEY | 一意識別子 (UUID) |
| `sync_type` | TEXT | NOT NULL | 処理種別 (例: "gmail_polling") |
| `status` | TEXT | NOT NULL | 実行結果 (success, error) |
| `processed_count` | INTEGER | DEFAULT 0 | 処理（新規/更新）されたレコード数 |
| `error_detail` | TEXT | - | エラー発生時の詳細メッセージ |
| `executed_at` | INTEGER | DEFAULT (unixepoch()) | 実行日時 (Unix Epoch) |

---

## 3. インデックス設計

```sql
-- 利用開始日でのソート・範囲検索用
CREATE INDEX idx_bookings_event_date ON bookings(event_date);

-- ステータスによる絞り込み用
CREATE INDEX idx_bookings_status ON bookings(status);

-- 重複チェックの高速化
CREATE INDEX idx_bookings_raw_mail_id ON bookings(raw_mail_id);
```

---

## 4. データ更新の考え方

- **INSERT OR IGNORE / REPLACE**:
  Cronによる定期取得時、既に `raw_mail_id` が存在するデータについては、ステータスの変更（例: 申込 -> 当選）がある場合のみ更新を行う。
- **時間の正規化**:
  メール本文の `2025年11月13日(木)18:15` は、パース時に `2025-11-13 18:15` の形式に変換して保存する。
