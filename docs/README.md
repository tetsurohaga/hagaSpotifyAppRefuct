# Spotify Now Playing アプリ 再構築 設計書

既存アプリ `hagawork_SpotifyApp`（Python/Flask）と同等の機能を、新しい技術スタックで作り直すための設計書一式です。
まず「動くアプリ」を作ることを最優先とし、細部は実装後に調整する方針です。

## 技術スタック（確定）

| レイヤ | 採用技術 |
| --- | --- |
| フロントエンド | SvelteKit（静的ビルド / SPA）+ Markdown レンダリング |
| 静的ホスティング | AWS S3 |
| CDN / 配信 | AWS CloudFront |
| バックエンド | TypeScript（Node.js 20）on AWS Lambda（Hono ルーター） |
| API 公開 | Lambda Function URL（CloudFront の `/api/*` ビヘイビア経由） |
| データベース | DynamoDB（**既存テーブル `spotiapp_artists` を流用**） |
| 主要外部API | Spotify Web API（既存どおり） |
| 生成AI | Claude API（`@anthropic-ai/sdk` / `claude-opus-4-8`）※ Perplexity から置換 |
| シークレット管理 | AWS SSM パラメータストア（既存どおり） |
| IaC | AWS CDK（TypeScript） |
| リージョン | ap-northeast-1（東京） |

## 確定した方針

- **認証/セッション**: Spotify リフレッシュトークンを **httpOnly Cookie** に保持（新規 DB 不要）。
- **ドメイン**: まず **CloudFront 標準ドメイン**（`https://xxxx.cloudfront.net`）で動かす。独自ドメインは後付け。
- **デザイン**: 既存のデザイン（2 パネル構成・配色・フォント）を踏襲。
- **DynamoDB**: 既存テーブル・スキーマをそのまま流用（データが既に入っているため）。

## ドキュメント構成

| ファイル | 内容 |
| --- | --- |
| [01-overview.md](./01-overview.md) | 既存アプリの機能分析と再構築の全体方針 |
| [02-architecture.md](./02-architecture.md) | システム構成・リクエストフロー・プロジェクト構成 |
| [03-backend-api.md](./03-backend-api.md) | Lambda API 仕様・認証フロー・Claude連携 |
| [04-frontend.md](./04-frontend.md) | SvelteKit フロント設計・画面・Markdown対応 |
| [05-data-model.md](./05-data-model.md) | DynamoDB テーブル仕様（流用） |
| [06-infra-deploy.md](./06-infra-deploy.md) | AWS構成・IaC・シークレット・デプロイ |
| [07-implementation-plan.md](./07-implementation-plan.md) | 実装手順（Claude Code 向けステップ） |

## 既存アプリとの主な差分

| 項目 | 既存 | 新規 |
| --- | --- | --- |
| 実行形態 | Flask + uWSGI + Nginx（常駐サーバ） | Lambda（サーバレス） |
| フロント | Jinja2 テンプレート + バニラJS | SvelteKit（SPA） |
| 配信 | サーバ直配信 | S3 + CloudFront |
| セッション | Flask サーバサイドセッション | httpOnly Cookie（リフレッシュトークン） |
| アーティスト解説生成 | Perplexity API（`sonar`） | Claude API（`claude-opus-4-8`） |
| 出力形式 | プレーンテキスト | Markdown（フロントで描画） |
