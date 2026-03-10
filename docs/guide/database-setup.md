# データベースセットアップ手順書 (Cloudflare D1)

本ドキュメントでは、開発環境および本番環境における Cloudflare D1 のセットアップ手順について説明する。

## 1. D1 インスタンスの作成

以下のコマンドを実行して、D1 インスタンスを作成する。

```bash
npx wrangler d1 create gym-booking-db
```

実行後、コンソールに表示される設定情報を `wrangler.jsonc` (または `wrangler.toml`) にコピーする。

例:
```json
"d1_databases": [
  {
    "binding": "gym_booking_db",
    "database_name": "gym-booking-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
]
```

## 2. マイグレーションの適用

### 2.1 ローカル環境
ローカル開発用の SQLite にマイグレーションを適用する。

```bash
npx wrangler d1 migrations apply gym-booking-db --local
```

### 2.2 本番環境 (Cloudflare)
Cloudflare 上の本番用 DB インスタンスにマイグレーションを適用する。

```bash
npx wrangler d1 migrations apply gym-booking-db --remote
```

## 3. データの確認方法

### 3.1 実行結果の確認（SQLの直接実行）
ローカル環境でデータを直接クエリして確認する場合：

```bash
npx wrangler d1 execute gym-booking-db --local --command "SELECT * FROM bookings;"
```

### 3.2 ダッシュボード経由
Cloudflare Dashboard の [Workers & Pages] > [D1] から対象のデータベースを選択し、[Console] タブから SQL を実行できる。

## 4. 開発時の注意点
- **ローカル開発時の選択**: `wrangler dev` 起動時などにリモートリソースに接続するか聞かれた場合は、特別な理由がない限り **No** を選択し、ローカルの SQLite を使用することを推奨する。
- **マイグレーションの作成**: `migrations` フォルダに `XXXX_description.sql` 形式でファイルを追加し、適用コマンドを実行する。
