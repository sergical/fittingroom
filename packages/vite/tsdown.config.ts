import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/astro.ts"],
  format: "esm",
  dts: true,
});
