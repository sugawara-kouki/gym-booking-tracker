# トラブルシューティング・開発ログ

開発中に発生した課題、エラー、およびその解決策を記録します。

## 2026-03-09: プロジェクト初期化と Gmail API PoC

### 1. プロジェクト初期化によるファイルの衝突
- **事象**: `README.md` や `wrangler.jsonc` が Hono の初期化コマンド (`npm create hono`) によって上書きされた。
- **原因**: カレントディレクトリに対してスクリプトを実行したため、既存ファイルがデフォルト値で上書きされた。
- **解決策**: 事前に作成していた要件定義の内容を、初期化後の `README.md` にマージして復元した。
- **教訓**: フレームワークの初期化コマンドを実行する際は、大切なファイルを一時避難させるか、Gitのコミットを活用して復元できるようにしておくこと。

### 2. Cloudflare Workers 環境での型エラー
- **事象**: `fetch` や `URL` などの組み込み関数が TypeScript でエラーになった。
- **原因**: 標準の DOM ライブラリではなく、Workers 特有の型定義が必要だった。
- **解決策**: `@cloudflare/workers-types` をインストールし、`tsconfig.json` の `compilerOptions.types` に追加した。

### 3. Gmail API: `invalid_grant` エラー (リフレッシュトークンの不備)
- **事象**: `Failed to refresh access token` エラーが発生し、Gmail API からデータが取得できなかった。
- **原因**: `.dev.vars` に設定した `GOOGLE_REFRESH_TOKEN` の末尾に、不要なドット (`.`) が含まれていた。
- **解決策**: ドットを削除して保存し、Wrangler を再起動（または自動検知）させた。
- **教訓**: トークンやシークレットをコピー＆ペーストする際は、末尾の記号や空白に細心の注意を払うこと。ログに `response.status` と `response.text()` を詳細に出力するようにしたことで原因特定が速まった。

### 4. 設定ファイルの Git 管理ポリシー
- **事象**: `wrangler.jsonc` を Git に含めて良いか迷った。
- **機密情報**: `npx wrangler secret put` で設定した値は Cloudflare サーバー側に、`.dev.vars` はローカルに閉じているため、`wrangler.jsonc` 自体には機密情報は含まれない。
- **結論**: インフラ構成（Binds 等）を共有するため、`wrangler.jsonc` は Git 管理対象とする。生のシークレットが記載された `memo.txt` 等は即座に削除する。
