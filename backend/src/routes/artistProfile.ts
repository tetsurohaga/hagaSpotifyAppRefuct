// GET /api/artist-profile        — 再生中の各アーティスト情報を返す（解説はキャッシュ分のみ即返却）
// GET /api/generate-biography     — 未生成アーティストの解説を1人ぶん生成（async 化のためフロントから個別呼び出し）
// GET /api/regenerate-biography   — 指定アーティストの解説を再生成（既存 /regenerate_biography 移植）
// PUT /api/biography              — 解説を手で編集した内容で上書き（body: { artist_id, biography }）

import { Hono } from "hono";
import { requireAuth, type AppVariables } from "../lib/auth.js";
import {
  refreshAccessToken,
  getCurrentlyPlaying,
  getArtist,
} from "../services/spotify.js";
import {
  getBiography,
  getStickyNotes,
  registerArtist,
  updateBiography,
} from "../services/artists.js";
import { generateBiography } from "../services/claude.js";
import { createKnowMoreUrl } from "../prompts/artistPrompt.js";

export const artistProfileRoutes = new Hono<{ Variables: AppVariables }>();

artistProfileRoutes.use("*", requireAuth);

artistProfileRoutes.get("/artist-profile", async (c) => {
  const token = await refreshAccessToken(c.get("refreshToken"));
  const playing = await getCurrentlyPlaying(token.access_token);

  if (playing.status === 204 || !playing.item) {
    return c.body(null, 204);
  }

  // ここでは Claude 生成を行わず、Spotify 情報 + キャッシュ済み解説のみを即返す。
  // 未生成（description === null）はフロントが /generate-biography で1人ずつ取得する（async 化）。
  // これにより 1 リクエストで複数生成を抱え込まず、30s 上限を超えにくくする。
  const result = await Promise.all(
    playing.item.artists.map(async (ref) => {
      const artist = await getArtist(token.access_token, ref.id);

      // genres が空配列なら既存踏襲のフォールバック。
      const genres =
        artist.genres && artist.genres.length > 0
          ? artist.genres
          : ["genres undefined"];

      // 解説（未生成なら null）と付箋を並行取得。
      const [biography, stickyNotes] = await Promise.all([
        getBiography(ref.id),
        getStickyNotes(ref.id),
      ]);

      return {
        id: ref.id,
        name: artist.name,
        image: artist.images[0]?.url ?? "",
        genres,
        description: biography,
        knowmore: createKnowMoreUrl(artist.name),
        stickyNotes,
      };
    }),
  );

  return c.json(result);
});

artistProfileRoutes.get("/generate-biography", async (c) => {
  const artistId = c.req.query("artist_id");
  if (!artistId) {
    return c.json({ error: "Missing artist_id" }, 400);
  }

  // 既に生成済みなら再生成せず返す（多重トリガ・競合に対する冪等性）。
  const existing = await getBiography(artistId);
  if (existing !== null) {
    return c.json({ biography: existing });
  }

  // 未生成: Spotify から名前/ジャンルを取得し、生成して登録する。
  const token = await refreshAccessToken(c.get("refreshToken"));
  const artist = await getArtist(token.access_token, artistId);
  const genres =
    artist.genres && artist.genres.length > 0
      ? artist.genres
      : ["genres undefined"];

  const biography = await generateBiography(artist.name);
  const timestamp = String(Math.floor(Date.now() / 1000));
  await registerArtist({
    id: artistId,
    artistName: artist.name,
    biography,
    genres,
    timestamp,
  });

  return c.json({ biography });
});

artistProfileRoutes.get("/regenerate-biography", async (c) => {
  const artistId = c.req.query("artist_id");
  const artistName = c.req.query("artist_name");

  if (!artistId || !artistName) {
    return c.json({ error: "Missing artist_name or artist_id" }, 400);
  }

  const biography = await generateBiography(artistName);
  const timestamp = String(Math.floor(Date.now() / 1000));
  await updateBiography(artistId, biography, timestamp);

  return c.json({ new_biography: biography });
});

// 手編集した解説の保存。生成物と同じ属性（biography）を上書きするだけで、
// 再生成すればこの手編集は消える（既存の regenerate の挙動どおり）。
const MAX_BIOGRAPHY_LEN = 20000;

artistProfileRoutes.put("/biography", async (c) => {
  const body = await c.req.json().catch(() => null);
  const artistId = typeof body?.artist_id === "string" ? body.artist_id : "";
  const biography = typeof body?.biography === "string" ? body.biography : null;

  if (!artistId) return c.json({ error: "Missing artist_id" }, 400);
  if (biography === null) return c.json({ error: "Missing biography" }, 400);
  if (biography.trim() === "") return c.json({ error: "Empty biography" }, 400);
  if (biography.length > MAX_BIOGRAPHY_LEN) {
    return c.json({ error: `Biography exceeds ${MAX_BIOGRAPHY_LEN} chars` }, 400);
  }

  // 未登録アーティストに対する更新は作らない（Update の upsert を避ける）。
  if ((await getBiography(artistId)) === null) {
    return c.json({ error: "Artist not found" }, 404);
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  await updateBiography(artistId, biography, timestamp);

  return c.json({ biography });
});
