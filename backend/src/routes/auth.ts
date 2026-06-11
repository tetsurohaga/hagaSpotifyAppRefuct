// 認証フロー: /api/login, /api/callback, /api/logout（既存 app.py の /login,/callback 移植）。

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { randomBytes } from "node:crypto";
import { exchangeCodeForToken } from "../services/spotify.js";
import { getSpotifyClientId, getSpotifyRedirectUri } from "../services/secrets.js";
import { SPOTIFY_SCOPE, FRONTEND_REDIRECT_PATH } from "../config.js";
import {
  COOKIE,
  baseCookieOptions,
  STATE_MAX_AGE,
  REFRESH_MAX_AGE,
} from "../lib/cookies.js";

export const authRoutes = new Hono();

// GET /api/login — state を発行し Spotify 認可画面へ 302。
authRoutes.get("/login", async (c) => {
  const state = randomBytes(16).toString("hex");
  setCookie(c, COOKIE.oauthState, state, {
    ...baseCookieOptions,
    maxAge: STATE_MAX_AGE,
  });

  const [clientId, redirectUri] = await Promise.all([
    getSpotifyClientId(),
    getSpotifyRedirectUri(),
  ]);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return c.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`, 302);
});

// GET /api/callback — state 検証 → code をトークン交換 → sp_refresh をセット → フロントへ 302。
authRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const savedState = getCookie(c, COOKIE.oauthState);

  if (!state || !savedState || state !== savedState) {
    return c.text("State mismatch error", 400);
  }
  if (!code) {
    return c.text("Missing code", 400);
  }

  const token = await exchangeCodeForToken(code);
  if (!token.refresh_token) {
    return c.text("No refresh_token returned by Spotify", 502);
  }

  setCookie(c, COOKIE.refresh, token.refresh_token, {
    ...baseCookieOptions,
    maxAge: REFRESH_MAX_AGE,
  });
  // state Cookie は失効。
  deleteCookie(c, COOKIE.oauthState, { ...baseCookieOptions });

  return c.redirect(FRONTEND_REDIRECT_PATH, 302);
});

// POST /api/logout — sp_refresh Cookie を破棄。
authRoutes.post("/logout", (c) => {
  deleteCookie(c, COOKIE.refresh, { ...baseCookieOptions });
  return c.json({ ok: true });
});
