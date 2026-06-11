// GET /api/currently-playing — 再生中トラックを返す（既存 /currently_playing 移植）。

import { Hono } from "hono";
import { requireAuth, type AppVariables } from "../lib/auth.js";
import { refreshAccessToken, getCurrentlyPlaying } from "../services/spotify.js";

export const currentlyPlayingRoutes = new Hono<{ Variables: AppVariables }>();

currentlyPlayingRoutes.use("*", requireAuth);

currentlyPlayingRoutes.get("/currently-playing", async (c) => {
  const token = await refreshAccessToken(c.get("refreshToken"));
  const playing = await getCurrentlyPlaying(token.access_token);

  if (playing.status === 204 || !playing.item) {
    return c.body(null, 204);
  }

  const item = playing.item;
  return c.json({
    artists: item.artists.map((a) => a.name),
    track: item.name,
    image: item.album.images[0]?.url ?? "",
  });
});
