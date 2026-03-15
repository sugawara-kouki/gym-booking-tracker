# Repository パターン移行計画

現在の実装では、APIのハンドラー(`src/routes/poc.ts`) や 同期サービス(`src/services/sync-orchestrator.ts`) の内部で直接Cloudflare D1の機能 (`c.env.gym_booking_db` などのバインディング) を呼び出し、SQLを発行しています。

これを **Repository パターン** にリファクタリングすることで、データアクセスロジックを分離し、将来的にHono以外のフレームワークや別のデータベース(PostgreSQL, MySQLなど)に移行しやすくなります。

## 概要

### 目標
- データアクセス(SQL実行)を専用の「Repository」クラスにカプセル化する。
- サービス(ビジネスロジック)やルーター(HTTPハンドリング)からデータベースの種類や詳細(D1/Cloudflare)を隠蔽する。

## 提案する変更内容

### 1. Repository インターフェースと実装の作成

#### [NEW] `src/repositories/types.ts`
各エンティティの基本型と、リポジトリが提供すべきメソッドのインターフェース(型定義)を作成します。
- `BookingRepository`
- `SyncRunRepository`
- `RawEmailRepository`
- `SyncLogRepository`

#### [NEW] `src/repositories/d1/index.ts` 等
Cloudflare D1 を使用する実際のリポジトリの実装クラスを作成します。
- `D1BookingRepository` (implements `BookingRepository`)
- 他のリポジトリも同様にD1用の実装を用意します。

### 2. Dependency Injection (DI)層の構築 (ファクトリの用意)

#### [NEW] `src/di/repositories.ts` (または `src/config/context.ts` など)
実行環境(`c.env`) を受け取り、作成したD1リポジトリ群のインスタンスを生成して返す関数(ファクトリ)を用意します。これにより、利用側は直接D1を触らずに済みます。

### 3. ルートとサービスの改修

#### [MODIFY] `src/routes/poc.ts`
データベース操作(`db.prepare(...)`) を **Repository インスタンス経由でのメソッド呼び出し** に置き換えます。
- 例: `await bookingRepository.findAll()`

#### [MODIFY] `src/services/sync-orchestrator.ts`
現状、クラス内で `this.env.gym_booking_db.prepare(...)` を多用しているため、コンストラクタでリポジトリインターフェースを受け取る（または内部でDIコンテナから取得する）ように変更し、生のSQLを隠蔽します。
- `initSyncRun` -> `syncRunRepo.create(...)`
- `saveBooking` -> `bookingRepo.upsert(...)`

## 検証プラン

### 自動テストの確認
- TypeScript のコンパイル(`npm run dev` 起動時のチェック) が通るか確認する。
- 既存の型定義(`zod-openapi` のレスポンスなど)との不整合がないか確認する。

### 手動での検証
- 移行後も Swagger UI (`/swagger` エンドポイント) から以下の既存APIがエラーなく動作することを確認する：
  1. `/poc/db-test` (予約一覧の取得)
  2. `/poc/ingest`, `/poc/parse-pending`, `/poc/sync` (同期処理とデータの保存)
  3. `/poc/db-clear` (データの削除)
