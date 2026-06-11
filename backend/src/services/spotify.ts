// Spotify Web API 連携（既存 spotify_token.py / get_currently_playing.py の移植）。
// 全リクエストに Accept-Language: ja を付与（日本語アーティスト名対応・既存踏襲）。

import {
  getSpotifyClientId,
  getSpotifyClientSecret,
  getSpotifyRedirectUri,
} from "./secrets.js";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

async function basicAuthHeader(): Promise<string> {
  const [id, secret] = await Promise.all([
    getSpotifyClientId(),
    getSpotifyClientSecret(),
  ]);
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

/** 認可コード → アクセストークン/リフレッシュトークン。 */
export async function exchangeCodeForToken(
  code: string,
): Promise<TokenResponse> {
  const redirectUri = await getSpotifyRedirectUri();
  const auth = await basicAuthHeader();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * リフレッシュトークン → アクセストークン。
 * Spotify は通常 refresh_token を返さないため、呼び出し側は元の値を維持する。
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const redirectUri = await getSpotifyRedirectUri();
  const auth = await basicAuthHeader();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Accept-Language": "ja",
  };
}

export type SpotifyArtistRef = { id: string; name: string };
export type CurrentlyPlaying = {
  status: 200 | 204;
  item?: {
    name: string;
    album: { images: { url: string }[] };
    artists: SpotifyArtistRef[];
  };
};

/** 再生中トラック取得。204（再生なし）と 200 を区別して返す。 */
export async function getCurrentlyPlaying(
  accessToken: string,
): Promise<CurrentlyPlaying> {
  const res = await fetch(`${API_BASE}/me/player/currently-playing`, {
    headers: authHeaders(accessToken),
  });
  if (res.status === 204) return { status: 204 };
  if (!res.ok) {
    throw new Error(`Spotify currently-playing failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as CurrentlyPlaying["item"];
  return { status: 200, item: data };
}

export type SpotifyArtist = {
  id: string;
  name: string;
  genres: string[];
  images: { url: string }[];
};

/** アーティスト詳細取得（名前・画像・ジャンル）。 */
export async function getArtist(
  accessToken: string,
  artistId: string,
): Promise<SpotifyArtist> {
  const res = await fetch(`${API_BASE}/artists/${artistId}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(`Spotify get-artist failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as SpotifyArtist;
}
