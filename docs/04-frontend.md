# 04. フロントエンド設計（SvelteKit）

既存のデザインを踏襲。SvelteKit を **静的SPA** として構築し、S3+CloudFront で配信する。

## 4.1 ビルド設定

`svelte.config.js`:

```js
import adapter from "@sveltejs/adapter-static";

export default {
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html",   // SPA フォールバック
    }),
  },
};
```

`src/routes/+layout.ts`:

```ts
export const ssr = false;       // サーバレンダリングしない
export const prerender = false; // 動的データ前提
```

- API はすべて同一ドメインの `/api/*`（CloudFront 経由）を相対パスで叩く。
  Cookie は same-site で自動送信される（`fetch(..., { credentials: "same-origin" })`）。

## 4.2 画面

### `/`（ログイン画面） — 旧 `/start`

- 既存 `login.html` 相当。中央上部に大きなタイトル「Login to Spotify」、その下に「Login」ボタン。
- 「Login」クリックで `/api/login` へフル遷移（`window.location.href = "/api/login"`）。
- `body.login-page` 系のスタイルを適用。

### `/now-playing`（再生中画面） — 旧 `/currently_playing_page`

- 2 パネル構成（既存 `currently_playing.html` 相当）:
  - **左パネル (40%)**: 「Now Playing」見出し、`Get Currently Playing Track` ボタン、
    アーティスト名 / トラック名 / アルバム画像。
  - **右パネル (60%)**: 「Artist Info」見出し、アーティストカード群。
- ロード時に `currently-playing` と `artist-profile` を並行取得。
- `Get Currently Playing Track` ボタンで再取得。

## 4.3 コンポーネント

### `TrackPanel.svelte`（左パネル）
- props: `track: Track | null`。
- 表示: Artist（カンマ区切り）/ Track / アルバム画像。
- 再取得ボタンのクリックを親へ伝播。

### `ArtistCard.svelte`（右パネル 1 枚）
- props: `artist: Artist`。
- 表示: 名前 (`h3`)、画像、`Genres: "..."`、解説（**Markdown 描画**）、
  `Know More "..."` ボタン（`knowmore` を新規タブで開く）、`Regenerate biography "..."` ボタン。
- `Regenerate` クリック → `/api/regenerate-biography?artist_id=&artist_name=` を呼び、
  解説部分のみ `Searching...` → 新解説に差し替え。

### `Markdown.svelte`（Markdown 描画）
- props: `source: string`。
- `marked` で HTML 化し、`DOMPurify` でサニタイズして `{@html}` 描画。

```svelte
<script lang="ts">
  import { marked } from "marked";
  import DOMPurify from "dompurify";
  export let source: string;
  $: html = DOMPurify.sanitize(marked.parse(source ?? "") as string);
</script>

<div class="markdown-body">{@html html}</div>
```

> **重要（Markdown対応）**: 既存はプレーンテキストを `textContent` で表示していたが、
> 新仕様では Claude が返す Markdown を必ずこの `Markdown.svelte` で描画すること。

## 4.4 API ラッパ（lib/api.ts）

```ts
export type Track = { artists: string[]; track: string; image: string };
export type Artist = {
  id: string; name: string; image: string;
  genres: string[]; description: string; knowmore: string;
};

const opts: RequestInit = { credentials: "same-origin" };

export async function getCurrentlyPlaying(): Promise<Track | null> {
  const r = await fetch("/api/currently-playing", opts);
  if (r.status === 204) return null;
  if (r.status === 401) { location.href = "/"; return null; }
  if (!r.ok) throw new Error(`currently-playing: ${r.status}`);
  return r.json();
}

export async function getArtistProfiles(): Promise<Artist[]> {
  const r = await fetch("/api/artist-profile", opts);
  if (r.status === 204) return [];
  if (r.status === 401) { location.href = "/"; return []; }
  if (!r.ok) throw new Error(`artist-profile: ${r.status}`);
  return r.json();
}

export async function regenerateBiography(id: string, name: string): Promise<string> {
  const u = `/api/regenerate-biography?artist_id=${encodeURIComponent(id)}&artist_name=${encodeURIComponent(name)}`;
  const r = await fetch(u, opts);
  if (!r.ok) throw new Error(`regenerate: ${r.status}`);
  return (await r.json()).new_biography;
}
```

- `401` を受けたらログイン画面（`/`）へ誘導。

## 4.5 スタイル / アセット

- 既存 `static/css/style.css` を `src/lib/styles/app.css` に移植し、`+layout.svelte` で読み込む。
  - 2パネルレイアウト、`#currently-playing-title` / `#artist-title` の配色（`#c9be22`）、
    `.artist-card`、各ボタン（`.know-more-button` / `.regenerate-button` / `#get-track`）、
    `login-page` 系をそのまま使用。
- フォント: `MinecraftFifty-Solid.otf`（および `Pixelmania.ttf`）を `static/fonts/` に配置し、
  `@font-face` のパスを `/fonts/...` に合わせる。
- `favicon.ico` を `static/` に配置。
- アルバム画像・アーティスト画像は Spotify CDN（`i.scdn.co`）を直接参照。

## 4.6 状態管理

- ページローカルな状態で十分（Svelte の `$state`/ストア不要レベル）。
- 既存JSの `sessionStorage` による artist 名/ID 保持は、Svelte ではコンポーネント props で
  保持できるため不要。
