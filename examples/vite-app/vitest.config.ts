import { defineConfig } from "vitest/config";

// Browser boot and dev-server startup make the e2e loop slower than a
// unit test; give it real time.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
