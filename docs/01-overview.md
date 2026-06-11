# 01. 概要 — 既存アプリの分析と再構築方針

## 1.1 アプリの目的

Spotify で「現在再生中の曲」を取得し、その曲のアーティスト情報（プロフィール／解説）を
生成AIで作成して表示する Web アプリ。アーティスト解説は DynamoDB にキャッシュし、
再生成（リフレッシュ）も可能。

## 1.2 既存アプリの構成（読み取り結果）

Python/Flask 製。主要ファイルと役割は以下。

| ファイル | 役割 |
| --- | --- |
| `app.py` | Flask 本体。全ルーティング定義 |
| `spotify_token.py` | Spotify OAuth トークン取得・リフレッシュ |
| `get_currently_playing.py` | 再生中トラック取得 / アーティスト詳細取得（Spotify API） |
| `get_artist_info.py` | Perplexity で解説生成 / DynamoDB 読み書き |
| `conditional_statements.py` | 解説生成用プロンプト本文 |
| `get_secrets.py` | SSM パラメータストアから認証情報取得 |
| `session_create.py` | boto3 セッション生成 |
| `templates/*.html` | ログイン画面 / 再生中画面 |
| `static/js/*.js` | フロントのフェッチ処理・DOM 構築 |
| `static/css/style.css` | スタイル（2パネル構成） |

### 既存のルーティングと機能

| メソッド/パス | 機能 |
| --- | --- |
| `GET /start` | ログイン画面表示 |
| `GET /login` | Spotify 認可画面へリダイレクト（state 発行、セッション保存） |
| `GET /callback` | 認可コード→トークン交換、セッションに保存、再生中画面へ |
| `GET /currently_playing` | 再生中トラックの `{artists, track, image}` を返す |
| `GET /artist_profile` | 再生中トラックの各アーティストについて、Spotify から名前/画像/ジャンルを取得し、DynamoDB に解説が無ければ Perplexity で生成・保存して返す |
| `GET /regenerate_biography?artist_name=&artist_id=` | 指定アーティストの解説を再生成し DynamoDB を更新 |
| `GET /currently_playing_page` | 再生中画面表示 |

### Spotify スコープ

```
user-read-private user-read-email user-read-currently-playing
```

### アーティスト解説生成ロジック（重要）

1. 再生中トラックの各 `artist_id` について Spotify `/v1/artists/{id}` で名前・画像・ジャンルを取得。
2. DynamoDB `spotiapp_artists` を `id`（= Spotify アーティストID）で参照。
3. `biography` が存在すればキャッシュを返す。
4. 無ければ生成AIで解説を生成 → DynamoDB に `put_item` で新規登録。
5. 再生成リクエスト時は生成し直し `update_item` で `biography` と `registration_timestamp` を更新。

解説生成プロンプト（`conditional_statements.py`）の要点:
- 日本語で回答
- 人柄・音楽性・経歴・ライフスタイル・社会的影響の観点
- 流れるような文章（箇条書きを避ける）、ポップで絵文字を含む文体
- アーティスト名/曲名/アルバム名は英字表記
- 事実ベース、推測を避ける

### 「Know More」リンク

Perplexity の検索 URL（`https://www.perplexity.ai/?q=...`）をブラウザで開くだけの外部リンク。
API キーは不要なので、新アプリでも**外部検索リンクとして維持**する（軽微な機能のため、必要なら後で変更）。

## 1.3 再構築の方針

### そのまま踏襲するもの
- 画面構成・配色・フォント（既存 `style.css` を流用）
- 機能フロー（再生中取得 → アーティスト解説 → 再生成）
- DynamoDB テーブル `spotiapp_artists`（スキーマ流用）
- Spotify API の使い方・スコープ

### 置き換えるもの
- **Perplexity API → Claude API**（`claude-opus-4-8`）。
  - Perplexity `sonar` はWeb検索で最新情報を参照していた。Claude でも情報の正確性を保つため、
    **Claude のサーバサイド Web 検索ツール（`web_search_20260209`）を併用**してアーティスト情報をグラウンディングする（[03](./03-backend-api.md) 参照）。
- **出力をMarkdown化**。プロンプトでMarkdown整形を許可し、フロントで Markdown を描画する。
  - 既存プロンプトの「流れるような文章」方針は維持しつつ、見出し・強調などの軽いMarkdownを許容。

### アーキテクチャ転換に伴う設計判断
- 常駐サーバ（Flask/uWSGI/Nginx）→ サーバレス（Lambda）。
- サーバサイドセッション → httpOnly Cookie にリフレッシュトークンを保持（[03](./03-backend-api.md) 認証フロー参照）。
- テンプレート配信 → SvelteKit 静的ビルドを S3+CloudFront 配信。
- 同一 CloudFront ドメイン配下で `/api/*` を Lambda にルーティングし、Cookie を same-site で扱う。
