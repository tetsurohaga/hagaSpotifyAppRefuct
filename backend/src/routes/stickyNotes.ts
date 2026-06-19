// POST   /api/sticky-notes  — 付箋を1枚追加（body: { artist_id, text, color }）
// DELETE /api/sticky-notes  — 付箋を1枚削除（query: artist_id, note_id）
// 付箋はアーティスト単位で DynamoDB spotiapp_artists の sticky_notes マップに永続化する。

import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { requireAuth, type AppVariables } from "../lib/auth.js";
import { addStickyNote, deleteStickyNote } from "../services/artists.js";

export const stickyNoteRoutes = new Hono<{ Variables: AppVariables }>();

stickyNoteRoutes.use("*", requireAuth);

const MAX_LEN = 80;
// 許可する付箋カラー（フロントのパレットと一致）。
const ALLOWED_COLORS = new Set([
  "#ffe14d",
  "#f7c5e0",
  "#e3c8f5",
  "#c8f0d8",
  "#c5e3f7",
  "#ffd6a8",
]);

/** 画像の例（qxilr384jf 等）に近い短いランダムIDを生成。 */
function newNoteId(): string {
  return randomBytes(6).toString("hex"); // 12桁の16進
}

stickyNoteRoutes.post("/sticky-notes", async (c) => {
  const body = await c.req.json().catch(() => null);
  const artistId = typeof body?.artist_id === "string" ? body.artist_id : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const color = typeof body?.color === "string" ? body.color : "";

  if (!artistId) return c.json({ error: "Missing artist_id" }, 400);
  if (!text) return c.json({ error: "Empty text" }, 400);
  if (text.length > MAX_LEN) {
    return c.json({ error: `Text exceeds ${MAX_LEN} chars` }, 400);
  }
  if (!ALLOWED_COLORS.has(color)) {
    return c.json({ error: "Invalid color" }, 400);
  }

  const note = { id: newNoteId(), text, color };
  await addStickyNote(artistId, note);
  return c.json(note, 201);
});

stickyNoteRoutes.delete("/sticky-notes", async (c) => {
  const artistId = c.req.query("artist_id");
  const noteId = c.req.query("note_id");
  if (!artistId || !noteId) {
    return c.json({ error: "Missing artist_id or note_id" }, 400);
  }
  await deleteStickyNote(artistId, noteId);
  return c.body(null, 204);
});
