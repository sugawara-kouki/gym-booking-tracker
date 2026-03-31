# 同期アーキテクチャ設計：2段階同期パイプライン

Gmail からのメール同期処理を「生のデータの取り込み（Ingest）」と「データ解析（Parse）」の 2 段階に分離することで、堅牢性とスケーラビリティを確保しています。

## 1. デザイン原則

- **Fault Tolerance (対障害性)**: 解析エラーが発生しても生データ (`raw_emails`) が DB に残るため、ロジック修正後の再試行が容易。
- **Data Integrity (整合性)**: 2000 件規模の大量メールもページネーションを用いて漏れなく取得。
- **Automation (自動化)**: Cloudflare Workers の Scheduled イベント (Cron) による定期実行に対応。

## 2. 性能最適化 (Performance)

大量のメールを効率的に処理するため、以下の最適化を行っています。

#### 2.1 D1 Batching
Cloudflare Workers と D1 間の通信オーバーヘッドを最小化するため、以下の操作で D1 Batch API を使用しています。
- **Gmail Ingest**: 取得した複数のメッセージを一括保存（`batchCreate`）。
- **Booking Parse**: 解析した複数の予約情報、解析ステータス更新、実行ログを一括反映（`batchUpsert`, `batchUpdateParseStatus`, `batchCreate`）。

これにより、同期処理時の HTTP 往復回数が劇的に削減されています。

## 3. 同期コンポーネント (Factory Functions)

### Gmail Service (`createGmailService`)
- ページネーション (`nextPageToken`) を処理し、クエリに一致する全メッセージをフェッチ。
- 添付ファイルや特殊なエンコーディングのデコード処理を担当。

### Sync Orchestrator (`createSyncOrchestrator`)
- **`ingest()`**: Gmail から新規メールをフェッチし、`raw_emails` に `pending` 状態で保存（バッチ処理）。
- **`processPending()`**: `pending` 状態のメールを解析し、`bookings` に UPSERT。結果とログを一括反映。

---

## 4. 実行サイクル

1. **Cron Trigger**: `wrangler.jsonc` で定義されたスケジュールに基づき実行。
2. **Scheduled Handler**: `src/index.ts` の `export default { scheduled(...) }` 内で `SyncOrchestrator.sync()` をキック。
3. **Background Job**: Handler から非同期に開始される。

## 5. 冪等性の担保
- `raw_mail_id` をユニークキーとして利用し、同一メールに対する重複パースや重複登録を DB レベルおよびロジックレベルで完全に防止しています。
