// ローカル開発用エントリ（@hono/node-server）。`npm run dev` で起動。
// AWS 認証情報（SSM/DynamoDB アクセス）がローカルに必要。Spotify の Redirect URI も
// ローカル用を別途登録すれば OAuth まで確認できる（任意・フェーズ4）。

import { serve } from "@hono/node-server";
import { app_ } from "./index.js";

const port = Number(process.env.PORT ?? 8888);
serve({ fetch: app_.fetch, port }, (info) => {
  console.log(`Backend listening on http://localhost:${info.port}`);
});
