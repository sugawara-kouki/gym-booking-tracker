# 設計書：Swagger (OpenAPI) 環境の構築 (2026-03-12)

APIの仕様を可視化し、ブラウザから簡単にテスト実行できるようにするため、Swagger UIをローカルで起動できる環境を構築します。

## 1. 目的
- **APIの可視化**: PoCエンドポイント（同期、取り込み、パース、DB操作等）の仕様を一覧化。
- **動作確認の容易化**: ブラウザ上のUIからパラメータを指定して即座にテスト実行。
- **ドキュメントの標準化**: OpenAPI 3.0形式で仕様を管理し、開発効率を向上。

## 2. 実装内容

### OpenAPI Specification (`docs/openapi.yaml`)
- 以下のエンドポイントとそのリクエスト/レスポンス型を定義します：
    - `/poc/sync`: インジェスト＋パースの統合同期
    - `/poc/ingest`: Gmailからのメール取り込みのみ
    - `/poc/parse-pending`: DB内の未処理メールの解析
    - `/poc/db-test`: DB接続・データ取得確認
    - `/poc/db-clear`: データベース全データ削除
    - `/poc/emails`: Gmail API疎通確認（生データ表示）

### Docker構成 (`compose.yml`)
- `swaggerapi/swagger-ui` イメージを使用。
- `docs/openapi.yaml` をコンテナ内の `/app/openapi.yaml` にマウント。
- 環境変数 `SWAGGER_JSON=/app/openapi.yaml` を設定し、ホストのマシンからファイルを読み込み。

## 3. 起動手順
1. 本プロジェクトのルートディレクトリで以下のコマンドを実行：
   ```bash
   docker compose up -d
   ```
2. ブラウザで以下のURLにアクセス：
   `http://localhost:8080`

## 4. 検証項目
- Swagger UIが正常に起動し、作成したYAMLの内容が正しく表示されること。
- 「Try it out」ボタンから、実際にローカルで起動しているWorkerのAPIをコールできること。
