import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Writes `css` to a fresh temp file and returns its path. */
export function tempFile(css: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "fittingroom-")), "tokens.css");
  writeFileSync(path, css);
  return path;
}
