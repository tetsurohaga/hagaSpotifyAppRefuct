# 03. バックエンド API 仕様

Lambda（TypeScript / Hono）。CloudFront 経由で `/api/*` がこの Lambda にルーティングされる。
ベースパスは `/api`。

## 3.1 共通事項

- ランタイム: Node.js 20.x、TypeScript、ESM。
- リージョン: ap-northeast-1。
- レスポンスは原則 JSON（`Content-Type: application/json`）。
- 認証は **httpOnly Cookie `sp_refresh`**（Spotify リフレッシュトークン）に依存。
- アクセストークンは保存せず、**API 呼び出しのたびにリフレッシュトークンから再取得**（既存挙動と同じ）。
- Spotify への各リクエストには `Accept-Language: ja` を付与（日本語アーティスト名対応・既存踏襲）。

### 認証ガード

`/api/login`・`/api/callback` 以外のエンドポイントは `sp_refresh` Cookie が必須。
無ければ `401 { "error": "unauthenticated" }` を返し、フロントはログイン画面へ誘導する。

## 3.2 エンドポイント一覧

| メソッド | パス | 認証 | 説明 |
| --- | --- | --- | --- |
| GET | `/api/login` | 不要 | Spotify 認可画面へ 302。`oauth_state` Cookie をセット |
| GET | `/api/callback` | 不要 | code→token 交換、`sp_refresh` Cookie セット、`/now-playing` へ 302 |
| POST | `/api/logout` | 任意 | `sp_refresh` Cookie を破棄 |
| GET | `/api/currently-playing` | 必須 | 再生中トラックを返す |
| GET | `/api/artist-profile` | 必須 | 再生中の各アーティスト情報＋解説を返す |
| GET | `/api/regenerate-biography` | 必須 | 指定アーティストの解説を再生成し更新 |

---

### GET /api/login

- `state`（ランダム16バイトhex）を生成。
- `Set-Cookie: oauth_state=<state>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
- 302 Location:
  ```
  https://accounts.spotify.com/authorize?response_type=code
    &client_id={CLIENT_ID}
    &scope=user-read-private%20user-read-email%20user-read-currently-playing
    &redirect_uri={REDIRECT_URI}
    &state={state}
  ```

### GET /api/callback

- クエリ: `code`, `state`。
- `state` が `oauth_state` Cookie と一致しなければ `400 state mismatch`。
- Spotify `POST /api/token`（`grant_type=authorization_code`）で交換。
  - ヘッダ: `Authorization: Basic base64(client_id:client_secret)`
  - body: `grant_type=authorization_code&code=...&redirect_uri=...`
- レスポンスの `refresh_token` を Cookie に保存:
  ```
  Set-Cookie: sp_refresh=<refresh_token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000
  ```
- `oauth_state` Cookie は失効（`Max-Age=0`）。
- 302 Location: `/now-playing`

### POST /api/logout

- `Set-Cookie: sp_refresh=; Max-Age=0; Path=/` で破棄。`200 { "ok": true }`。

### GET /api/currently-playing

- `sp_refresh` からアクセストークンをリフレッシュ。
- Spotify `GET /v1/me/player/currently-playing`。
- 204（再生なし）→ `204`（ボディなし）。フロントは「再生中なし」を表示。
- 200 → 整形して返す:

```json
{
  "artists": ["Artist A", "Artist B"],
  "track": "Track Name",
  "image": "https://i.scdn.co/image/....jpg"
}
```

抽出元: `item.name`, `item.album.images[0].url`, `item.artists[].name`。

### GET /api/artist-profile

- `sp_refresh` からアクセストークンをリフレッシュ。
- Spotify `GET /v1/me/player/currently-playing` で `item.artists[].id` を取得。
- 各 `artist_id` について:
  1. Spotify `GET /v1/artists/{id}` で `name`, `images[0].url`, `genres` を取得。
     - `genres` が空配列なら `["genres undifined"]` にフォールバック（既存踏襲）。
  2. DynamoDB `spotiapp_artists` を `id` で参照（`biography` 射影）。
  3. `biography` 有り → キャッシュ採用。`request_count` を +1 してもよい（任意・後回し可）。
  4. 無し → Claude で生成（[3.4](#34-claude-連携) 参照）→ `put_item` で新規登録
     （`id, artist_name, biography, genres, registration_timestamp, request_count=1`）。
- レスポンスは配列:

```json
[
  {
    "id": "spotifyArtistId",
    "name": "Artist Name",
    "image": "https://i.scdn.co/image/....jpg",
    "genres": ["j-pop", "city pop"],
    "description": "（Markdown 形式のアーティスト解説）",
    "knowmore": "https://www.perplexity.ai/?q=..."
  }
]
```

- 再生なし（204）の場合は `204`。
- `description` は **Markdown 文字列**（フロントで描画）。
- `knowmore` は外部検索リンク（API 不要）。

### GET /api/regenerate-biography

- クエリ: `artist_id`（必須）, `artist_name`（必須）。
- 欠落時 `400 { "error": "Missing artist_name or artist_id" }`。
- Claude で解説を再生成。
- DynamoDB `update_item`:
  ```
  SET biography = :bio, registration_timestamp = :rt
  ```
- レスポンス:

```json
{ "new_biography": "（新しい Markdown 解説）" }
```

## 3.3 Spotify サービス（services/spotify.ts）

既存 `spotify_token.py` / `get_currently_playing.py` の移植。

- `exchangeCodeForToken(code)`: 認可コード → `{access_token, refresh_token}`。
- `refreshAccessToken(refreshToken)`: `grant_type=refresh_token` → `{access_token}`。
  - Spotify は通常 `refresh_token` を返さないため、Cookie の値を維持。
- `getCurrentlyPlaying(accessToken)`: 再生中取得（204/200 を区別）。
- `getArtist(accessToken, artistId)`: アーティスト詳細取得。
- 全リクエストに `Accept-Language: ja`。

## 3.4 Claude 連携（services/claude.ts）

詳細は本節に集約。SDK は `@anthropic-ai/sdk`。

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: CLAUDE_API_KEY });

export async function generateBiography(artistName: string): Promise<string> {
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },          // 推奨デフォルト
    system: SYSTEM_PROMPT,                    // prompts/artistPrompt.ts
    tools: [{ type: "web_search_20260209", name: "web_search" }], // 情報グラウンディング
    messages: [
      {
        role: "user",
        content: `アーティスト '${artistName}' について、以下の指示に従って情報を提供してください：\n\n${ARTIST_PROMPT}`,
      },
    ],
  });

  // Web 検索ツール使用時は pause_turn ループに注意（下記）
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
```

### モデル / パラメータ方針
- **モデル**: `claude-opus-4-8`（最新・高性能。明示指定が無い限りこれを使用）。
- **thinking**: `{ type: "adaptive" }`（アダプティブthinking推奨）。`budget_tokens` は使用しない。
- **max_tokens**: 解説は短文のため 4000 程度で十分。非ストリーミングで可。
- **Web 検索ツール**: `web_search_20260209` を付与。Perplexity が担っていた「最新情報の参照」を代替し、
  事実性を高める。サーバサイドツールのため、`stop_reason === "pause_turn"` の場合は
  アシスタント応答を再送して継続するループを実装する（[shared/tool-use の pause_turn 参照]）。
  - シンプルさ優先で、まず Web 検索なしで動かし、後から追加してもよい（任意）。

### プロンプト（prompts/artistPrompt.ts）

既存 `conditional_statements.py` を移植。**Markdown 出力を許可**する点のみ調整:

- 日本語で回答。
- 観点: 人柄・人間性 / 音楽性 / 経歴・背景 / ライフスタイル / 社会的影響。
- 文体: 明るく自然で読みやすく、絵文字を交えたポップさ。
- アーティスト名・曲名・アルバム名は英字表記。
- **Markdown 整形（見出し `##`、強調 `**`、適度な改行）を許可**。ただし箇条書きの多用は避け、
  流れるような文章を基調とする。
- 事実ベースで、推測・憶測を避ける。

System プロンプト（`SYSTEM_PROMPT`）は既存どおり:
> あなたは音楽アーティストの情報を提供する専門アシスタントです。提供されたプロンプトに従って、
> 詳細で正確な情報を日本語で（Markdown 形式で）回答してください。

## 3.5 DynamoDB サービス（services/artists.ts）

`@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`（DocumentClient）。
詳細スキーマは [05-data-model.md](./05-data-model.md)。

- `getBiography(artistId)`: `biography` を射影取得。無ければ `null`。
- `registerArtist({ id, artistName, biography, genres, timestamp })`: `put_item`。
  `request_count = 1`。`genres` は **String Set（SS）** で保存（既存スキーマ準拠）。
- `updateBiography(artistId, biography, timestamp)`: `update_item`。

> 注意: 既存テーブルは `genres` を `SS`（文字列セット）で保持している。
> DocumentClient で書き込む場合は Set 型（`new Set([...])`）を用いるか、低レベル API で `{ SS: [...] }` を指定する。
> 既存データとの整合のため **SS を維持**すること。

## 3.6 シークレット（services/secrets.ts）

SSM パラメータストアから取得（既存 `get_secrets.py` 相当）。Lambda 実行中はメモリキャッシュ。

| パラメータ名 | 用途 |
| --- | --- |
| `/hagawork/SPOTIFY_CLIENT_ID` | Spotify クライアントID |
| `/hagawork/SPOTIFY_CLIENT_SECRET` | Spotify クライアントシークレット |
| `/hagawork/SPOTIFY_REDIRECT_URI` | リダイレクトURI（CloudFront ドメイン+`/api/callback`）※新規に設定 |
| `/hagawork/CLAUDE_API_KEY` | Claude API キー（**新規作成**、下記） |

- 既存 `/hagawork/PERPLEXITY_KEY` は使用しない。
- `/hagawork/CLAUDE_API_KEY` を新規に SSM SecureString として登録する（値は提供済みキー）。
  デプロイ後に CloudFront ドメインが確定したら `SPOTIFY_REDIRECT_URI` を設定する。
- 取得は `GetParameter`（`WithDecryption: true`）。Lambda 実行ロールに `ssm:GetParameter` を付与。

## 3.7 Cookie ヘルパ（lib/cookies.ts）

- `serializeCookie(name, value, opts)`: `Set-Cookie` 文字列生成。
- 既定属性: `HttpOnly; Secure; SameSite=Lax; Path=/`。
- `parseCookies(header)`: リクエストの `Cookie` ヘッダを解析。
- Hono では `hono/cookie` の `getCookie` / `setCookie` を利用してもよい。
