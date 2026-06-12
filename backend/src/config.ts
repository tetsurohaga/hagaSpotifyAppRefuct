// 非機密の設定値（環境変数）と、機密を引く SSM パラメータ名の定義。
// 機密そのものは services/secrets.ts 経由で SSM から取得する。

export const REGION = process.env.AWS_REGION ?? "ap-northeast-1";

export const ARTISTS_TABLE = process.env.ARTISTS_TABLE ?? "spotiapp_artists";

export const SPOTIFY_SCOPE =
  process.env.SPOTIFY_SCOPE ??
  "user-read-private user-read-email user-read-currently-playing";

// callback 後にフロントへ戻す先（CloudFront 同一ドメイン上の相対パス）。
export const FRONTEND_REDIRECT_PATH =
  process.env.FRONTEND_REDIRECT_PATH ?? "/now-playing";

// Claude 設定。解説生成は応答速度重視で Sonnet 4.6 を既定に（環境変数で上書き可）。
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
// Web 検索ツールでの情報グラウンディング（フェーズ4）。既定オフ。
export const CLAUDE_WEB_SEARCH = process.env.CLAUDE_WEB_SEARCH === "true";

// SSM パラメータ名（SecureString）。
export const SSM_PARAMS = {
  spotifyClientId: "/hagawork/SPOTIFY_CLIENT_ID",
  spotifyClientSecret: "/hagawork/SPOTIFY_CLIENT_SECRET",
  spotifyRedirectUri: "/hagawork/SPOTIFY_REDIRECT_URI",
  claudeApiKey: "/hagawork/CLAUDE_API_KEY",
} as const;
