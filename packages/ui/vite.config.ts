import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The built UI is served under the plugin's route (default
  // /__fittingroom/), so asset URLs must be page-relative.
  base: "./",
  plugins: [react()],
});
