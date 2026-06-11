// GET /api/artist-profile        — 再生中の各アーティスト情報＋解説（既存 /artist_profile 移植）
// GET /api/regenerate-biography   — 指定アーティストの解説を再生成（既存 /regenerate_biography 移植）

import { Hono } from "hono";
import { requireAuth, type AppVariables } from "../lib/auth.js";
import {
  refreshAccessToken,
  getCurrentlyPlaying,
  getArtist,
} from "../services/spotify.js";
import {
  getBiography,
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

  const result = [];
  for (const ref of playing.item.artists) {
    const artist = await getArtist(token.access_token, ref.id);

    // genres が空配列なら既存踏襲のフォールバック。
    const genres =
      artist.genres && artist.genres.length > 0
        ? artist.genres
        : ["genres undifined"];

    let biography = await getBiography(ref.id);
    if (biography === null) {
      biography = await generateBiography(artist.name);
      const timestamp = String(Math.floor(Date.now() / 1000));
      await registerArtist({
        id: ref.id,
        artistName: artist.name,
        biography,
        genres,
        timestamp,
      });
    }

    result.push({
      id: ref.id,
      name: artist.name,
      image: artist.images[0]?.url ?? "",
      genres,
      description: biography,
      knowmore: createKnowMoreUrl(artist.name),
    });
  }

  return c.json(result);
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
