// API フェッチラッパ。すべて同一ドメインの /api/* を相対パスで叩く。
// Cookie は same-site で自動送信される。401 はログイン画面へ誘導。

import type { Track, Artist, StickyNote } from "./types";

const opts: RequestInit = { credentials: "same-origin" };

function toLogin(): null {
  if (typeof location !== "undefined") location.href = "/";
  return null;
}

// CloudFront OAC + Lambda Function URL(AWS_IAM) 経由では、ボディ付き(POST/PUT)
// リクエストのボディは CloudFront が署名してくれない。クライアント側でボディの
// SHA256(16進) を x-amz-content-sha256 に載せないと Function URL の署名検証が
// 失敗して 403 になる（それを CloudFront のエラーページ設定が index.html にすり替え、
// フロントで JSON パースが "Unexpected token '<'" になる）。
// 参考: docs.aws.amazon.com/AmazonCloudFront/.../private-content-restricting-access-to-lambda.html
async function sha256Hex(body: string): Promise<string> {
  const bytes = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

// 付箋を1枚追加し、サーバが採番したノート（id 付き）を返す。
export async function addStickyNote(
  artistId: string,
  text: string,
  color: string,
): Promise<StickyNote | null> {
  const body = JSON.stringify({ artist_id: artistId, text, color });
  const r = await fetch("/api/sticky-notes", {
    ...opts,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // OAC 経由のボディ付きリクエストに必須（上記 sha256Hex のコメント参照）。
      "x-amz-content-sha256": await sha256Hex(body),
    },
    body,
  });
  if (r.status === 401) return toLogin();
  if (!r.ok) throw new Error(`sticky-notes POST: ${r.status}`);
  return (await r.json()) as StickyNote;
}

// 付箋を1枚削除。
export async function deleteStickyNote(
  artistId: string,
  noteId: string,
): Promise<void> {
  const u = `/api/sticky-notes?artist_id=${encodeURIComponent(artistId)}&note_id=${encodeURIComponent(noteId)}`;
  const r = await fetch(u, { ...opts, method: "DELETE" });
  if (r.status === 401) {
    toLogin();
    return;
  }
  if (!r.ok && r.status !== 204) throw new Error(`sticky-notes DELETE: ${r.status}`);
}
