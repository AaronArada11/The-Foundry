import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: "node_modules/tesseract.js/dist/worker.min.js", dest: "ocr", rename: { stripBase: true } },
        { src: "node_modules/tesseract.js-core/tesseract-core*", dest: "ocr/core", rename: { stripBase: true } },
        { src: "node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz", dest: "ocr/lang", rename: { stripBase: true } },
      ],
    }),
  ],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    globals: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
