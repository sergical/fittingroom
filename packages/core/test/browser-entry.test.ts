import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ENTRY = resolve(import.meta.dirname, "../src/browser.ts");
const IMPORT_RE = /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g;

/**
 * Resolves a relative specifier (as written with a `.js` extension, since
 * the source imports the way the compiled output will) back to the `.ts`
 * source file it came from.
 */
function resolveSpecifier(fromFile: string, specifier: string): string {
  const withoutExt = specifier.replace(/\.js$/, "");
  return `${resolve(dirname(fromFile), withoutExt)}.ts`;
}

/**
 * Walks the relative-import graph reachable from `entry` by reading files
 * off disk and following `import`/`export ... from` specifiers — no module
 * is ever executed. Returns every `node:`-prefixed specifier found, paired
 * with the file that imports it, so a violation names its own culprit
 * instead of failing as an opaque "blank page" bug report.
 */
function findNodeImports(
  entry: string,
): Array<{ file: string; specifier: string }> {
  const violations: Array<{ file: string; specifier: string }> = [];
  const visited = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1];
      if (specifier.startsWith("node:")) {
        violations.push({ file, specifier });
      } else if (specifier.startsWith(".")) {
        queue.push(resolveSpecifier(file, specifier));
      }
      // Bare specifiers (third-party packages) are out of scope: this
      // guard is only about `@fittingroom/core`'s own re-export graph.
    }
  }

  return violations;
}

describe("the browser entry point's import graph", () => {
  it("never reaches a node:-prefixed module", () => {
    const violations = findNodeImports(ENTRY);

    expect(
      violations,
      violations
        .map((v) => `${v.file} imports "${v.specifier}"`)
        .join("\n"),
    ).toEqual([]);
  });
});
