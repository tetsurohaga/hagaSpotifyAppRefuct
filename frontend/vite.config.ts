import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// 開発時は /api を実 API に転送する。BACKEND_ORIGIN にデプロイ済み API か
// ローカル backend（http://localhost:8888）を指定（既定はローカル backend）。
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8888";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      "/api": {
        target: backendOrigin,
        changeOrigin: true,
      },
    },
  },
});
