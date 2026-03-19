# Googleアカウント認証機能（マルチテナント基盤・簡易フロント付き） 実装プラン

マイクロサービスとしての責務を保ちつつ、将来的な「マルチテナント（複数ユーザーがそれぞれログインして自身の予約メールを同期するパターンB）」を見据えた基盤をHonoで構築します。
現時点ではPoC用の簡易画面をHono内に用意しますが、最終的には分離されたフロントエンドからAPIとして呼び出される設計にします。

## 実装方針
サードパーティのパッケージ（Next.jsなど）はバックエンド側には追加せず、Honoの標準機能やルーターを使って**OAuth 2.0 認可コードフロー**を実装します。最大の変更点として、`.dev.vars`の固定リフレッシュトークンを脱却し、DB（`users`テーブル）に各ユーザーのトークンを保存する仕組みを作ります。

## 提案する変更内容

### 1. データベーススキーマとリポジトリの拡張

#### [NEW] `users` テーブルの追加
各ログインユーザーとそのリフレッシュトークンを管理するためのテーブルを作成します。（※D1ローカルまたはマイグレーションの追加）
- `id` (Google Sub ID などを想定)
- `email`
- `name`
- `refresh_token_encrypted` (バックグラウンドの同期処理用に永続保管。**平文ではなく暗号化して保存**します)

#### [NEW] `UserRepository`
追加したテーブルに対応するリポジトリ（`UserRepository`、`D1UserRepository`）を作成し、ユーザー情報の Upsert 処理を実装します。

### 2. 認証用ルーターの作成

#### [NEW] `src/routes/auth.ts`
以下の3つのエンドポイントを持つ `auth` ルーターを作成します。

- `GET /auth/login`
  - フロントエンドが完成するまでのPoC用として、Honoの `c.html()` を利用し、「Googleでログインする」ボタンのみのシンプルなHTMLページを提供します。
- `GET /auth/google`
  - ログインボタンを押した先のURLです。
  - セキュリティ対策の `state` などを付与し、Googleの認可画面 (`https://accounts.google.com/o/oauth2/v2/auth`) へリダイレクトさせます。
  - この時、**将来のバックグラウンド同期のために必ず `access_type=offline` と `prompt=consent` を指定し、リフレッシュトークンが発行されるようにします。**
- `GET /auth/google/callback`
  - Googleでの同意後に戻ってくるコールバック用のURLです。
  - 発行された `code` を用いて、アクセストークン・ID Token・**リフレッシュトークン** を取得します。
  - 取得した `refresh_token` を、環境変数（`.dev.vars` の `ENCRYPTION_KEY`）と Web Crypto API を用いて**強力に暗号化**します。
  - ユーザー情報と**暗号化されたリフレッシュトークン**を `UserRepository` を通じてデータベースへ Upsert します。
  - その後、Hono標準のCookieモジュール等でAPIアクセス保護用の軽量なセッショントークンを発行し、ブラウザへ返します。

### 3. 本体アプリへの組み込みとAPI保護

#### [MODIFY] `src/index.ts`
- 新しい認証用のルーター `app.route('/auth', auth)` を組み込みます。

#### API保護ミドルウェアの作成と適用
- **`@hono/jwt` と `@hono/cookie` を組み合わせたハイブリッド構成**を採用します。
- ユーザーごとの身分証となる**JWT（JSON Web Token）**を署名生成し、それを**HttpOnly / Secure属性を持つ安全なCookie**としてブラウザに保存させます（XSS攻撃防止）。
- 保護したいAPI（`/poc/*` など）には、このCookieから自動的にJWTを読み取って暗号署名を検証するミドルウェア（`jwt({ cookie: 'auth_token', secret: ... })`）を適用し、安全でステートレスなアクセス保護を実現します。

## 注意事項・ユーザーへのお願い（Google Cloud 側の設定）

この実装にあたり、既存のGoogle Cloud Consoleプロジェクト（おそらくGmail API用に一度設定されているもの）で **OAuth 同意画面** と **認証情報** の追加設定が必要になる可能性が高いです。

1. **スコープの追加**: `openid`, `profile`, `email` に加え、**Gmail操作用スコープ** (`https://www.googleapis.com/auth/gmail.readonly` など) が必要です（リフレッシュトークンで将来的に同期するため）。
2. **承認済みのリダイレクト URI**: ローカル用に `http://localhost:8787/auth/google/callback` を追加する必要があります。

## 検証プラン
1. 開発サーバー (`npm run dev`) を起動する。
2. ブラウザで `http://localhost:8787/auth/login` にアクセスする。
3. ログイン画面が表示され、Googleのアカウント選択・同意画面に遷移できるか確認する。
4. ログイン後、正しくコールバックされ、ユーザー情報が取得できているか（一時的にJSONで画面に返す等）を確認する。
