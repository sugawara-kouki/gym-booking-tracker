# Google Cloud / Gmail API セットアップガイド

本システムで Gmail API を使用してメールを取得するための、Google Cloud の設定手順です。

## 1. Google Cloud プロジェクトの作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスします。
2. 「プロジェクトの選択」から「新しいプロジェクト」を作成します。
   - プロジェクト名: `gym-booking-tracker` (任意)

## 2. Gmail API の有効化

1. サイドメニューの「API とサービス」 > 「ライブラリ」を選択します。
2. 「Gmail API」を検索し、「有効にする」をクリックします。

## 3. OAuth 同意画面の設定

1. サイドメニューの「API とサービス」 > 「OAuth 同意画面」を選択します。
2. User Type で「外部」を選択し「作成」をクリックします。
3. アプリ情報を入力します（必須項目のみでOK）。
4. 「スコープの追加または削除」で以下を追加します：
   - `https://www.googleapis.com/auth/gmail.readonly` (メールの読み取り権限)
5. 「テストユーザー」に自分の Gmail アドレスを追加します。

## 4. 認証情報の作成 (Client ID / Secret)

1. サイドメニューの「API とサービス」 > 「認証情報」を選択します。
2. 「認証情報を作成」 > 「OAuth クライアント ID」を選択します。
3. アプリケーションの種類で「デスクトップ アプリ」を選択します。
4. 作成された **クライアント ID** と **クライアント シークレット** を控えておきます。
   - これらが `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` になります。

## 5. リフレッシュトークンの取得

サーバーレス環境（Cloudflare Workers）から常時アクセスするために、期限のない **リフレッシュトークン** を取得します。

### 手順例 (ブラウザを使用)

1. ブラウザで以下のURLの `[CLIENT_ID]` を自分のものに書き換えてアクセスします：
   ```text
   https://accounts.google.com/o/oauth2/v2/auth?
   client_id=[CLIENT_ID]&
   redirect_uri=http://localhost&
   response_type=code&
   scope=https://www.googleapis.com/auth/gmail.readonly&
   access_type=offline&
   prompt=consent
   ```
2. 認証を許可すると、ブラウザが `http://localhost/?code=4/P7q....` というURLにリダイレクトされます。
3. URLの `code=` 以降の文字列をコピーします。
4. ターミナルで以下の `curl` コマンドを実行してトークンを取得します：
   ```bash
   curl --data "code=[コピーしたCODE]" \
        --data "client_id=[CLIENT_ID]" \
        --data "client_secret=[CLIENT_SECRET]" \
        --data "redirect_uri=http://localhost" \
        --data "grant_type=authorization_code" \
        https://oauth2.googleapis.com/token
   ```
5. レスポンスに含まれる `refresh_token` を控えておきます。
   - これが `GOOGLE_REFRESH_TOKEN` になります。

---

## 6. Cloudflare Workers への設定

取得した値を `wrangler.jsonc` の `vars` または `wrangler secret` で設定します。

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REFRESH_TOKEN
```
