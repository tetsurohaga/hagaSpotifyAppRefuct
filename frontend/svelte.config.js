import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // 完全静的出力（SPA）。S3 + CloudFront で配信する。
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html", // SPA フォールバック
      precompress: false,
      strict: true,
    }),
  },
};

export default config;
