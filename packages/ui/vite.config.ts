import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The built UI is served under the plugin's route (default
  // /__fittingroom/), so asset URLs must be page-relative.
  base: "./",
  plugins: [react()],
  resolve: {
    // The refused-write diff renderer only ever highlights CSS patches.
    // @pierre/diffs imports the full shiki bundle (every grammar as its
    // own lazy chunk, ~11MB of dist the fittingroom package would have
    // to ship); the shim swaps in the web-grammar bundle.
    alias: [
      {
        find: /^shiki$/,
        replacement: fileURLToPath(
          new URL("./src/shiki-slim.ts", import.meta.url),
        ),
      },
    ],
  },
});
