// 認証ガード。/api/login・/api/callback 以外は sp_refresh Cookie を必須とする。
// 無ければ 401 { error: "unauthenticated" } を返し、フロントはログイン画面へ誘導する。

import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { COOKIE } from "./cookies.js";

export type AppVariables = {
  refreshToken: string;
};

export const requireAuth = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const token = getCookie(c, COOKIE.refresh);
    if (!token) {
      return c.json({ error: "unauthenticated" }, 401);
    }
    c.set("refreshToken", token);
    await next();
  },
);
