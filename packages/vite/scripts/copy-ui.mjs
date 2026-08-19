// Bundles @fittingroom/ui's built assets into this package's dist so the
// published plugin can serve the lab UI without depending on the private
// UI package at runtime.
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../../ui/dist/", import.meta.url));
const target = fileURLToPath(new URL("../dist/ui/", import.meta.url));

if (!existsSync(source)) {
  console.error("copy-ui: @fittingroom/ui has no dist — build it first");
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
