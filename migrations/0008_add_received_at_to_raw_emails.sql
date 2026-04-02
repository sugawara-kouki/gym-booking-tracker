-- raw_emails テーブルに受信日時（received_at）カラムを追加
ALTER TABLE raw_emails ADD COLUMN received_at INTEGER NOT NULL DEFAULT 0;

-- 既存のデータに対して、fetched_at を暫定的に received_at としてコピー（実際の値は次回の同期で更新されるか、そのまま維持）
UPDATE raw_emails SET received_at = fetched_at WHERE received_at = 0;
