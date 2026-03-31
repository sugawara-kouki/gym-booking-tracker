# Gym Booking Tracker

公共施設（主に体育館）の予約・当選メールを自動解析し、一元管理するためのシステムです。
Cloudflare Workers (Hono) 上で動作し、Gmail API と連携して情報を集約します。

## 1. プロジェクト概要

- **目的**: 複数の自治体・施設から届く通知メールを自動で解析、データベース化し、確認漏れを防ぐ。
- **ターゲット**: 複数の施設やアカウントを使い分けるスポーツ団体・個人。
- **アーキテクチャ**: サーバーレス、DI (Dependency Injection) を活用したテスト容易性の高い設計。

## 2. 技術構成

- **Framework**: [Hono](https://hono.dev/) (with Zod OpenAPI)
- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite based RDB)
- **Tooling**: [Biome](https://biomejs.dev/) (Lint/Format/Check)
- **Testing**: [Vitest](https://vitest.dev/)
- **Language**: TypeScript

## 3. 設計方針

本プロジェクトでは、保守性とテスト容易性を高めるため、以下の設計パターンを採用しています。

- **Factory Function パターン**: 従来の `class` ベースの実装ではなく、クロージャを利用した Factory 関数を採用し、`this` の排除とカプセル化を強化しています。
- **Repository パターン**: データベースアクセスを抽象化し、ビジネスロジックから切り離しています。
- **Type-Safe Routing**: Hono の Zod OpenAPI を利用し、型安全なリクエスト/レスポンスと自動生成される Swagger ドキュメントを実現しています。

## 4. 開発ガイド

### 4.1 開発コマンド

```bash
# ローカル開発サーバー起動 (Wrangler)
npm run dev

# 型チェック + Lint + 全体チェックを一括実行
npm run check:all

# テスト実行
npm run test

# セキュリティ脆弱性の修正 (package-lock.json 更新)
npm audit fix

# デプロイ (Cloudflare へ)
npm run deploy

# DB マイグレーション適用
npx wrangler d1 migrations apply gym-booking-db --local
```

### 4.2 開発ルール

- **型（Interface）優先**: 実装前に必ず型を定義し、コンポーネント間の契約を明確にする。
- **Biome による品質管理**: `npm run check:all` が通る状態を維持する。
- **テスト駆動**: 重要なビジネスロジック（メールパース等）には必ずテストを付随させる。

## 5. ドキュメント一覧

- [API 設計・仕様書](docs/design/api-design.md)
- [データベース設計書](docs/design/db-design.md)
- [システム構成図](docs/design/architecture.md)
- [Google Cloud (Gmail API) セットアップ手順](docs/guide/google-cloud-setup.md)
- [トラブルシューティング](docs/guide/troubleshooting.md)

---
© 2026 k-sugawara / Gym Booking Tracker Project
