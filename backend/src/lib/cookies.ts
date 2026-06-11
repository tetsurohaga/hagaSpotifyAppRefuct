// Cookie の共通属性と名前。実際の読み書きは hono/cookie の getCookie/setCookie/deleteCookie を使う。

import type { CookieOptions } from "hono/utils/cookie";

export const COOKIE = {
  refresh: "sp_refresh", // Spotify リフレッシュトークン（httpOnly）
  oauthState: "oauth_state", // CSRF 対策の state（httpOnly）
} as const;

// 既定属性: HttpOnly; Secure; SameSite=Lax; Path=/。
// 静的コンテンツと API を同一 CloudFront ドメインで配信するため SameSite=Lax で成立する。
export const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
  path: "/",
};

export const STATE_MAX_AGE = 600; // 10 分
export const REFRESH_MAX_AGE = 2592000; // 30 日
