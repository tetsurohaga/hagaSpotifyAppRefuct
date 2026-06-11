# 07. 実装計画（Claude Code 向けステップ）

「まず動くアプリ」を最短で通すための手順。各ステップは独立して検証可能にする。

## フェーズ 0: 準備

1. リポジトリ直下に `frontend/` `backend/` `infra/` を作成（[02](./02-architecture.md) の構成）。
2. 既存アセットを移植: `static/css/style.css`、`static/fonts/*`、`favicon.ico` を
   `frontend/` の対応場所へコピー。
3. Claude API キーを SSM `/hagawork/CLAUDE_API_KEY` に登録（[06](./06-infra-deploy.md) 6.4）。

## フェーズ 1: バックエンド（API）

1. `backend/` を初期化（`package.json`, `tsconfig.json`、ESM）。
   依存: `hono`, `@anthropic-ai/sdk`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`,
   `@aws-sdk/client-ssm`。
2. `services/secrets.ts`: SSM 取得＋キャッシュ。
3. `services/spotify.ts`: トークン交換/リフレッシュ、再生中取得、アーティスト取得。
4. `services/artists.ts`: DynamoDB 読み書き（`genres` は SS 維持）。
5. `prompts/artistPrompt.ts`: 解説プロンプト（Markdown 許可）。
6. `services/claude.ts`: `generateBiography()`（まず Web 検索なしで実装 → 後で `web_search` 追加）。
7. `lib/cookies.ts`: Cookie ヘルパ（または `hono/cookie`）。
8. `routes/auth.ts`: `/api/login`, `/api/callback`, `/api/logout`。
9. `routes/currentlyPlaying.ts`: `/api/currently-playing`。
10. `routes/artistProfile.ts`: `/api/artist-profile`, `/api/regenerate-biography`。
11. `index.ts`: Hono app 組み立て＋`handle()` エクスポート。認証ガードを共通ミドルウェアで。

**検証**: ローカル（`@hono/node-server`）またはデプロイ後に各エンドポイントを curl で確認。

## フェーズ 2: フロントエンド

1. `frontend/` を SvelteKit + TypeScript で初期化。`adapter-static` 設定（[04](./04-frontend.md)）。
   依存: `marked`, `dompurify`, `@types/dompurify`（必要に応じ）。
2. `lib/styles/app.css` に既存 CSS 移植、`+layout.svelte` で読み込み、`+layout.ts` で `ssr=false`。
3. `lib/api.ts`, `lib/types.ts` 実装。
4. `lib/components/Markdown.svelte`（marked + DOMPurify）。
5. `routes/+page.svelte`（ログイン画面、`/api/login` へ遷移）。
6. `routes/now-playing/+page.svelte` ＋ `TrackPanel.svelte` / `ArtistCard.svelte`。
   - ロード時に `currently-playing` と `artist-profile` を並行取得。
   - 「Get Currently Playing Track」で再取得、「Regenerate」で解説差し替え。
   - 解説は `Markdown.svelte` で描画。

**検証**: `npm run dev` で UI 表示確認（API はデプロイ済み or プロキシ）。

## フェーズ 3: インフラ / デプロイ

1. `infra/` を CDK（TypeScript）で初期化。
2. スタック定義（[06](./06-infra-deploy.md)）:
   - S3（非公開）+ OAC。
   - `NodejsFunction`（backend をバンドル）＋実行ロール（SSM/DynamoDB 最小権限）。
   - DynamoDB 既存テーブルを `fromTableName` で import し grant。
   - HTTP API（Lambda 統合）。
   - CloudFront（デフォルト→S3、`/api/*`→API GW、SPA フォールバック）。
   - `BucketDeployment` で `frontend/build` を配置＋invalidation。
3. `cdk bootstrap`（初回）→ `cdk deploy`。
4. CloudFront ドメイン確定 → SSM `SPOTIFY_REDIRECT_URI` 設定 →
   Spotify ダッシュボードに `https://<domain>/api/callback` を登録。

**検証（E2E）**:
- `/` でログイン → Spotify 認可 → `/now-playing` に戻る。
- 再生中の曲が表示され、アーティスト解説（Markdown）が表示される。
- 「Regenerate」で解説が再生成され、DynamoDB が更新される。
- 既にキャッシュ済みアーティストはキャッシュが返る。

## フェーズ 4: 仕上げ（後回し可）

- Claude `web_search` ツール追加（`pause_turn` ループ対応）。
- `request_count` のインクリメント。
- 独自ドメイン + ACM 証明書。
- ローカル開発環境の整備。
- エラーハンドリング/ローディング表示の改善。

## チェックリスト（動作要件）

- [ ] Spotify ログイン〜コールバックが Cookie ベースで成立する
- [ ] 再生中トラックが取得・表示される（204 のハンドリング含む）
- [ ] アーティスト解説が Claude で生成され、DynamoDB にキャッシュされる
- [ ] 解説が **Markdown として描画**される
- [ ] 解説の再生成ができ、DynamoDB が更新される
- [ ] 既存 DynamoDB データ（`genres` SS 等）と整合する
- [ ] 既存デザイン（2パネル・配色・フォント）が再現されている

## 既知の論点・確認ポイント（実装中に判断）

- Claude は学習データ範囲外/マイナーなアーティストで不正確になりうる。
  → `web_search` ツールでグラウンディング（フェーズ4）。まず動作優先で無しでも可。
- Spotify のリフレッシュトークンは長期有効だが失効時は再ログインへ誘導（401→`/`）。
- `genres` の SS 書き込みは空配列不可。`["genres undifined"]` フォールバックを必ず通す。
