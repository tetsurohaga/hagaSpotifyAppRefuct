# 02. アーキテクチャ

## 2.1 システム構成図

```
                    ┌─────────────────────────────────────────────┐
   ブラウザ          │              CloudFront (単一ドメイン)         │
  (SvelteKit SPA) ──▶│                                             │
                    │  ビヘイビア:                                  │
                    │   - デフォルト ( /, /*.js, /*.css ... ) ─────┼──▶ S3 (静的ビルド)
                    │   - /api/*                            ───────┼──▶ Lambda Function URL
                    └─────────────────────────────────────────────┘                │
                                                                                    ▼
                                                                              Lambda (TS / Hono)
                                                                                    │
                          ┌─────────────────────────────┬───────────────────────────┤
                          ▼                             ▼                            ▼
                   Spotify Web API              Claude API                  DynamoDB / SSM
                 (OAuth, 再生中, アーティスト)   (解説生成+Web検索)        (spotiapp_artists / 認証情報)
```

ポイント:
- **同一オリジン化**: 静的コンテンツと API を同じ CloudFront ドメインで配信することで、
  httpOnly Cookie を same-site（`SameSite=Lax`）で扱える。CORS の複雑さも回避。
- S3 はパブリックにせず **OAC（Origin Access Control）** で CloudFront からのみ参照。

## 2.2 リクエストフロー

### (A) 初回ログイン

```
1. ユーザー: ログイン画面 ( / ) の「Login」クリック
2. ブラウザ: /api/login へフル遷移
3. Lambda: state を生成し oauth_state Cookie をセット → Spotify 認可URLへ 302
4. Spotify: ユーザー認可 → /api/callback?code=...&state=... へ 302
5. Lambda: state 検証 → code をトークンに交換
          → refresh_token を httpOnly Cookie にセット
          → フロントの /now-playing へ 302
6. ブラウザ: /now-playing 表示（SPA が API を叩いてデータ取得）
```

### (B) 再生中＋アーティスト解説の取得

```
1. /now-playing ロード時、SPA が並行して:
   - GET /api/currently-playing
   - GET /api/artist-profile
2. Lambda: refresh_token Cookie を読み、Spotify アクセストークンを都度リフレッシュ
3. /api/currently-playing → {artists, track, image}
4. /api/artist-profile → 各アーティスト:
   - Spotify からプロフィール取得
   - DynamoDB に解説あり → そのまま返す
   - 無ければ Claude で生成 → DynamoDB 保存 → 返す
5. SPA: トラック情報・アーティストカード（Markdown 解説）を描画
```

### (C) 解説の再生成

```
1. アーティストカードの「Regenerate」クリック
2. GET /api/regenerate-biography?artist_id=&artist_name=
3. Lambda: Claude で再生成 → DynamoDB を update → 新しい解説を返す
4. SPA: 該当カードの解説のみ差し替え
```

## 2.3 プロジェクト構成（モノレポ）

```
20260611/                         ← 本プロジェクトルート
├── frontend/                     SvelteKit（静的SPA）
│   ├── src/
│   │   ├── app.html
│   │   ├── routes/
│   │   │   ├── +layout.svelte
│   │   │   ├── +layout.ts            (prerender/ssr 設定)
│   │   │   ├── +page.svelte          ログイン画面 (= 旧 /start)
│   │   │   └── now-playing/
│   │   │       └── +page.svelte      再生中画面 (= 旧 /currently_playing_page)
│   │   └── lib/
│   │       ├── api.ts                API フェッチラッパ
│   │       ├── types.ts              共有型 (Track, Artist など)
│   │       ├── components/
│   │       │   ├── TrackPanel.svelte
│   │       │   ├── ArtistCard.svelte
│   │       │   └── Markdown.svelte   Markdown 描画 (marked + DOMPurify)
│   │       └── styles/app.css        既存 style.css を移植
│   ├── static/
│   │   ├── favicon.ico               既存流用
│   │   └── fonts/                    MinecraftFifty-Solid.otf 等 既存流用
│   ├── svelte.config.js              adapter-static
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                      Lambda（TypeScript / Hono）
│   ├── src/
│   │   ├── index.ts                 Hono app + handle(awslambda)
│   │   ├── routes/
│   │   │   ├── auth.ts               /api/login, /api/callback, /api/logout
│   │   │   ├── currentlyPlaying.ts   /api/currently-playing
│   │   │   └── artistProfile.ts      /api/artist-profile, /api/regenerate-biography
│   │   ├── services/
│   │   │   ├── spotify.ts            トークン交換/リフレッシュ・API 呼び出し
│   │   │   ├── claude.ts             Claude 解説生成
│   │   │   ├── artists.ts            DynamoDB 読み書き
│   │   │   └── secrets.ts            SSM 取得（キャッシュ付き）
│   │   ├── lib/
│   │   │   └── cookies.ts            Cookie 生成/解析ヘルパ
│   │   └── prompts/
│   │       └── artistPrompt.ts       解説生成プロンプト（旧 conditional_statements 移植）
│   ├── tsconfig.json
│   └── package.json
│
├── infra/                        AWS CDK（TypeScript）
│   ├── bin/app.ts
│   ├── lib/
│   │   └── spotify-app-stack.ts
│   ├── cdk.json
│   ├── tsconfig.json
│   └── package.json
│
└── docs/                         本設計書
```

## 2.4 技術選定の補足

- **Hono**: Lambda 上で軽量・型安全にルーティングできるフレームワーク。
  `hono/aws-lambda` アダプタで Lambda Function URL（ペイロード2.0）イベントを直接処理可能。
  単一 Lambda 内でルーター分割でき、初期構築が速い。
- **adapter-static（SvelteKit）**: 完全静的出力。SPA フォールバック（`fallback: 'index.html'`）を
  有効化し、クライアントサイドルーティングで動かす。SSR は使わない。
- **marked + DOMPurify**: Claude が返す Markdown を HTML 化し、サニタイズして表示。
- **AWS CDK（TypeScript）**: バックエンドと言語を統一。S3/CloudFront/Lambda Function URL/Lambda/IAM を一括定義。
