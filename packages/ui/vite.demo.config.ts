import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the hosted demo: the lab UI on the in-memory fake adapter,
// plus the sample page its Preview iframe loads. Deployed as a static
// site (Cloudflare Workers static assets), so base is page-relative and
// the output lives beside the plugin-served dist instead of inside it.
export default defineConfig({
  root: fileURLToPath(new URL("./demo", import.meta.url)),
  base: "./",
  plugins: [react()],
  resolve: {
    // Same shiki slimming as the plugin-served build (see vite.config.ts).
    alias: [
      {
        find: /^shiki$/,
        replacement: fileURLToPath(
          new URL("./src/shiki-slim.ts", import.meta.url),
        ),
      },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-demo", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./demo/index.html", import.meta.url)),
        preview: fileURLToPath(new URL("./demo/preview.html", import.meta.url)),
      },
    },
  },
});
