// API フェッチラッパ。すべて同一ドメインの /api/* を相対パスで叩く。
// Cookie は same-site で自動送信される。401 はログイン画面へ誘導。

import type { Track, Artist } from "./types";

const opts: RequestInit = { credentials: "same-origin" };

function toLogin(): null {
  if (typeof location !== "undefined") location.href = "/";
  return null;
}

export async function getCurrentlyPlaying(): Promise<Track | null> {
  const r = await fetch("/api/currently-playing", opts);
  if (r.status === 204) return null;
  if (r.status === 401) return toLogin();
  if (!r.ok) throw new Error(`currently-playing: ${r.status}`);
  return (await r.json()) as Track;
}

export async function getArtistProfiles(): Promise<Artist[]> {
  const r = await fetch("/api/artist-profile", opts);
  if (r.status === 204) return [];
  if (r.status === 401) {
    toLogin();
    return [];
  }
  if (!r.ok) throw new Error(`artist-profile: ${r.status}`);
  return (await r.json()) as Artist[];
}

// 未生成アーティストの解説を1人ぶん生成して取得する（async 化）。
export async function generateBiography(id: string): Promise<string> {
  const u = `/api/generate-biography?artist_id=${encodeURIComponent(id)}`;
  const r = await fetch(u, opts);
  if (r.status === 401) {
    toLogin();
    return "";
  }
  if (!r.ok) throw new Error(`generate-biography: ${r.status}`);
  return ((await r.json()) as { biography: string }).biography;
}

export async function regenerateBiography(
  id: string,
  name: string,
): Promise<string> {
  const u = `/api/regenerate-biography?artist_id=${encodeURIComponent(id)}&artist_name=${encodeURIComponent(name)}`;
  const r = await fetch(u, opts);
  if (r.status === 401) {
    toLogin();
    return "";
  }
  if (!r.ok) throw new Error(`regenerate: ${r.status}`);
  return ((await r.json()) as { new_biography: string }).new_biography;
}
