import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTokenSource } from "../src/index.js";
import type { TokenValue } from "../src/index.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf8",
  );
}

/** Writes `css` to a fresh temp file and returns its path. */
function tempFile(css: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "fittingroom-")), "tokens.css");
  writeFileSync(path, css);
  return path;
}

interface ConformanceCase {
  dialect: "shadcn" | "emdash";
  fixture: string;
  tokenCount: number;
  /** Expected values keyed by token name, including one light/dark pair. */
  values: Record<string, TokenValue>;
  /** One edit and the exact declaration line it must rewrite. */
  edit: { name: string; value: string; before: string; after: string };
}

const cases: ConformanceCase[] = [
  {
    dialect: "shadcn",
    fixture: "shadcn-globals.css",
    tokenCount: 11,
    values: {
      "--primary": { light: "oklch(0.205 0 0)", dark: "oklch(0.922 0 0)" },
      "--background": { light: "oklch(1 0 0)", dark: "oklch(0.145 0 0)" },
      // --radius only appears in :root, so it has no dark half.
      "--radius": { light: "0.625rem", dark: undefined },
    },
    edit: {
      name: "--primary",
      value: "oklch(0.5 0.1 260)",
      before: "--primary: oklch(0.205 0 0);",
      after: "--primary: oklch(0.5 0.1 260);",
    },
  },
  {
    dialect: "emdash",
    fixture: "emdash-tokens.css",
    tokenCount: 6,
    values: {
      "--color-bg": { light: "#ffffff", dark: "#0a0a0a" },
      "--color-brand": {
        light: "oklch(0.6 0.2 260)",
        dark: "oklch(0.75 0.2 260)",
      },
      "--spacing-md": { raw: "1rem" },
      "--radius-md": { raw: "0.5rem" },
    },
    edit: {
      name: "--spacing-md",
      value: "1.25rem",
      before: "--spacing-md: 1rem;",
      after: "--spacing-md: 1.25rem;",
    },
  },
];

describe.each(cases)("$dialect dialect conformance", (c) => {
  const css = fixture(c.fixture);

  it("read() returns a TokenDocument tagged with its dialect", () => {
    const document = createTokenSource(tempFile(css)).read();
    expect(document?.dialect).toBe(c.dialect);
    expect(document?.tokens).toHaveLength(c.tokenCount);
  });

  it("read() keeps light/dark values on one token", () => {
    const document = createTokenSource(tempFile(css)).read();
    const byName = new Map(document?.tokens.map((t) => [t.name, t]));
    for (const [name, value] of Object.entries(c.values)) {
      expect(byName.get(name)?.value).toEqual(value);
    }
  });

  it("write() with zero edits leaves the file byte-identical", () => {
    const path = tempFile(css);
    const result = createTokenSource(path).write({});
    expect(result.status).toBe("applied");
    expect(readFileSync(path, "utf8")).toBe(css);
  });

  it("write() patches only the targeted declaration's line", () => {
    const path = tempFile(css);
    const result = createTokenSource(path).write({ [c.edit.name]: c.edit.value });
    expect(result.status).toBe("applied");

    const before = css.split("\n");
    const after = readFileSync(path, "utf8").split("\n");
    expect(after).toHaveLength(before.length);

    const changed: number[] = [];
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) changed.push(i);
    }

    expect(changed).toHaveLength(1);
    expect(before[changed[0]!]).toContain(c.edit.before);
    expect(after[changed[0]!]).toContain(c.edit.after);
  });
});

describe("emdash value parsing", () => {
  it("splits light-dark() whose arguments contain commas", () => {
    const source = createTokenSource(
      tempFile(
        ":root { --color-ink: light-dark(rgb(0, 0, 0), rgba(255, 255, 255, 0.9)); }\n",
      ),
    );
    expect(source.read()?.tokens[0]?.value).toEqual({
      light: "rgb(0, 0, 0)",
      dark: "rgba(255, 255, 255, 0.9)",
    });
  });
});
