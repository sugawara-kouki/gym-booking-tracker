# 同期アーキテクチャ設計：2段階同期パイプライン

Gmail からのメール同期処理を「生のデータの取り込み（Ingest）」と「データ解析（Parse）」の 2 段階に分離することで、堅牢性とスケーラビリティを確保しています。

## 1. デザイン原則

- **Fault Tolerance (対障害性)**: 解析エラーが発生しても生データ (`raw_emails`) が DB に残るため、ロジック修正後の再試行が容易。
- **Data Integrity (整合性)**: 500 件を超える大量のメールもページネーションを用いて漏れなく取得。
- **Automation (自動化)**: Cloudflare Workers の Scheduled イベント (Cron) による定期実行に対応。

## 2. データ構造 (D1)

### `raw_emails` テーブル
取得したメールをパース前の状態で一時保存します。
- `id`: Gmail Message ID (PK)
- `body`: デコード済みの本文全文
- `parse_status`: 解析状態 (`pending`, `completed`, `fail`, `skipped`)

## 3. 同期コンポーネント (Factory Functions)

### Gmail Service (`createGmailService`)
- ページネーション (`nextPageToken`) を処理し、クエリに一致する全メッセージをフェッチ。
- 添付ファイルや特殊なエンコーディングのデコード処理を担当。

### Sync Orchestrator (`createSyncOrchestrator`)
- **`ingest()`**: Gmail から新規メールをフェッチし、`raw_emails` に `pending` 状態で保存。
- **`processPending()`**: `pending` 状態のメールを時系列順に読み込み、`EmailParser` を用いて解析。結果を `bookings` に UPSERT し、ステータスを更新。
- **`sync()`**: インジェストとパースを統合して実行するメインエントリーポイント。

## 4. 実行サイクル

1. **Cron Trigger**: `wrangler.jsonc` で定義されたスケジュールに基づき実行。
2. **Scheduled Handler**: `src/index.ts` の `export default { scheduled(...) }` 内で `SyncOrchestrator.sync()` をキック。
3. **Background Job**: Handler から非同期に開始される。

## 5. 冪等性の担保
- `raw_mail_id` をユニークキーとして利用し、同一メールに対する重複パースや重複登録を DB レベルおよびロジックレベルで完全に防止しています。
