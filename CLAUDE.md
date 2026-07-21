# CLAUDE.md

Spotify の「現在再生中の曲」と、そのアーティスト解説（Claude API 生成）を表示する個人開発 Web アプリ。
旧 Flask 版（`../hagawork_SpotifyApp`）を SvelteKit + Hono/Lambda で作り直したもの。

## 構成（モノレポ）

| dir | 内容 | 技術 |
| --- | --- | --- |
| `frontend/` | 静的SPA（ログイン / `/now-playing`） | SvelteKit (adapter-static), marked + DOMPurify |
| `backend/` | API `/api/*` | TypeScript / Hono on Lambda |
| `infra/` | IaC | AWS CDK (S3+OAC / CloudFront / Lambda Function URL) |
| `docs/` | 設計書 01〜07 + HANDOFF | — |

データストア: DynamoDB `spotiapp_artists`（**既存テーブルを import。CDK 管理外・削除禁止**）。
シークレット: SSM `/hagawork/*`（SPOTIFY_CLIENT_ID / _SECRET / _REDIRECT_URI / CLAUDE_API_KEY）。
リージョン: ap-northeast-1。

## 主要フロー

1. `/api/login` → Spotify OAuth → `/api/callback` でリフレッシュトークンを **httpOnly Cookie** に保存
2. `/api/currently-playing` で再生中トラック取得
3. `/api/artist-profile` で各アーティストの解説を DynamoDB から取得、無ければ Claude で生成しキャッシュ
4. `/api/regenerate-biography` で再生成、`/api/sticky-notes` (POST/DELETE) で付箋を永続化

## 何を見ればよいか

| 知りたいこと | 見る場所 |
| --- | --- |
| 直近の作業経緯・稼働中の環境情報・守るべき制約 | **`docs/HANDOFF.md`（最初に読む）** |
| 設計全体 | `docs/README.md` → 必要な章のみ（01概要 / 02構成 / 03API / 04フロント / 05データ / 06インフラ） |
| API 実装 | `backend/src/index.ts`（ルート一覧）→ `routes/` → `services/` |
| 設定値・モデル名・SSM名 | `backend/src/config.ts` |
| 解説生成プロンプト | `backend/src/prompts/artistPrompt.ts` |
| 画面 | `frontend/src/routes/now-playing/+page.svelte` → `lib/components/` |
| AWS リソース定義 | `infra/lib/spotify-app-stack.ts` |
| デプロイ手順 | `infra/README.md` |

※ `docs/` は設計時点のスナップショットで一部が実装と乖離している（例: 使用モデルの既定値は
`backend/src/config.ts` が正、付箋機能は `docs/HANDOFF.md` にのみ記載）。**仕様の最終判断はコードを見る。**

## コマンド

```sh
cd backend  && npm run dev        # localhost:8888（要 AWS 認証情報）
cd frontend && npm run dev        # localhost:5173（/api は vite proxy）
cd backend  && npm run typecheck
cd frontend && npm run check
# デプロイ: frontend を build してから
cd infra && npx cdk deploy --profile hagauser1
```

テストフレームワークは未導入。検証は typecheck / check + 実機確認。

## 制約（必ず守る）

- **AWS**: 読み取りも含め必ず `--profile hagauser1`。変更系は「何を作る/消すか」を明示してから実行する。
- **DynamoDB `spotiapp_artists` は消さない**（本番データ入り、CDK 管理外）。
- **git identity**: コミットは `ypr7138@gmail.com`。業務用 `@aillis.jp` は使わない。
  再 clone 時は `git config --local core.hooksPath .githooks` で誤 push ガードを有効化。
- CloudFront は JP からのアクセスのみ許可（地理制限あり）。
