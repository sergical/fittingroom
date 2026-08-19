import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyEdits } from "../src/write/serialize.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf8",
  );
}

describe("applyEdits", () => {
  it("returns byte-identical input for shadcn-globals.css with zero edits", () => {
    const css = fixture("shadcn-globals.css");
    expect(applyEdits(css, {})).toBe(css);
  });

  it("returns byte-identical input for emdash-tokens.css with zero edits", () => {
    const css = fixture("emdash-tokens.css");
    expect(applyEdits(css, {})).toBe(css);
  });

  it("changes only the targeted declaration's value, line by line", () => {
    const css = fixture("shadcn-globals.css");
    const result = applyEdits(css, { "--primary": "oklch(0.5 0.1 260)" });

    const before = css.split("\n");
    const after = result.split("\n");
    expect(after).toHaveLength(before.length);

    const changed: number[] = [];
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) changed.push(i);
    }

    expect(changed).toHaveLength(1);
    expect(before[changed[0]!]).toContain("--primary: oklch(0.205 0 0);");
    expect(after[changed[0]!]).toContain("--primary: oklch(0.5 0.1 260);");
  });

  it("changes only the targeted declaration inside @layer for emdash-tokens.css", () => {
    const css = fixture("emdash-tokens.css");
    const result = applyEdits(css, { "--spacing-md": "1.25rem" });

    const before = css.split("\n");
    const after = result.split("\n");
    expect(after).toHaveLength(before.length);

    const changed: number[] = [];
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) changed.push(i);
    }

    expect(changed).toHaveLength(1);
    expect(before[changed[0]!]).toContain("--spacing-md: 1rem;");
    expect(after[changed[0]!]).toContain("--spacing-md: 1.25rem;");
  });
});
