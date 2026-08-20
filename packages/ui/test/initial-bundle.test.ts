import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A string that only the refusal-diff module emits (its wrapper class),
// used to locate the diff renderer inside the built assets.
const RENDERER_MARKER = "lab-refusal-rendered";

const dist = fileURLToPath(new URL("../dist", import.meta.url));

/** The one script dist/index.html loads before anything else runs. */
function entryChunk(): string {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const src = html.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1];
  if (!src) throw new Error("no entry script found in dist/index.html");
  return readFileSync(join(dist, src), "utf8");
}

describe("the initial UI bundle", () => {
  it("does not carry the diff renderer; a lazy chunk does", () => {
    expect(entryChunk()).not.toContain(RENDERER_MARKER);

    const assets = readdirSync(join(dist, "assets"));
    const lazyChunks = assets.filter(
      (name) =>
        name.endsWith(".js") &&
        readFileSync(join(dist, "assets", name), "utf8").includes(
          RENDERER_MARKER,
        ),
    );
    expect(lazyChunks).toHaveLength(1);
    expect(lazyChunks[0]).toMatch(/^refusal-diff-/);
  });
});
