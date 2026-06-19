// Hono アプリ組み立て + AWS Lambda ハンドラのエクスポート。
// CloudFront の /api/* がこの Lambda にルーティングされる。ベースパスは /api。

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { authRoutes } from "./routes/auth.js";
import { currentlyPlayingRoutes } from "./routes/currentlyPlaying.js";
import { artistProfileRoutes } from "./routes/artistProfile.js";
import { stickyNoteRoutes } from "./routes/stickyNotes.js";

const app = new Hono();

// ヘルスチェック（CloudFront 経由の疎通確認用）。
app.get("/api/health", (c) => c.json({ ok: true }));

// 各ルートグループを /api 配下にマウント。
app.route("/api", authRoutes);
app.route("/api", currentlyPlayingRoutes);
app.route("/api", artistProfileRoutes);
app.route("/api", stickyNoteRoutes);

// 想定外エラーは 500 JSON で返す。
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "internal_error" }, 500);
});

export const app_ = app; // テスト/ローカル用に素の app も公開。
export const handler = handle(app);
