import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTokenSource } from "../src/index.js";
import type { TokenValue } from "../src/index.js";
import { tempFile } from "./helpers.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf8",
  );
}

interface ConformanceCase {
  dialect: "shadcn" | "emdash";
  fixture: string;
  tokenCount: number;
  /** Expected values keyed by token name, including one light/dark pair. */
  values: Record<string, TokenValue>;
  /** One edit and the exact declaration line it must rewrite. */
  edit: Case;
  /** A dark-half edit and the exact declaration line it must rewrite. */
  darkEdit?: Case;
}

interface Case {
  name: string;
  value: string | { light?: string; dark?: string };
  before: string;
  after: string;
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
    darkEdit: {
      name: "--primary",
      value: { dark: "oklch(0.8 0 0)" },
      before: "--primary: oklch(0.922 0 0);",
      after: "--primary: oklch(0.8 0 0);",
    },
  },
  {
    dialect: "shadcn",
    fixture: "shadcn-theme.css",
    tokenCount: 3,
    values: {
      "--color-primary": { light: "oklch(0.205 0 0)", dark: undefined },
      "--radius-lg": { light: "0.625rem", dark: undefined },
    },
    edit: {
      name: "--radius-lg",
      value: "0.75rem",
      before: "--radius-lg: 0.625rem;",
      after: "--radius-lg: 0.75rem;",
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
    darkEdit: {
      name: "--color-bg",
      value: { dark: "#111111" },
      before: "--color-bg: light-dark(#ffffff, #0a0a0a);",
      after: "--color-bg: light-dark(#ffffff, #111111);",
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
    expectSingleLineEdit(css, c.edit);
  });

  it("write() with a dark-half edit patches only the dark declaration's line", (ctx) => {
    if (!c.darkEdit) return ctx.skip();
    expectSingleLineEdit(css, c.darkEdit);
  });
});

/**
 * Writes one edit and asserts exactly one line changed — the acceptance
 * criterion that patches are single-hunk and byte-identical elsewhere.
 */
function expectSingleLineEdit(css: string, edit: Case): void {
  const path = tempFile(css);
  const result = createTokenSource(path).write({ [edit.name]: edit.value });
  expect(result.status).toBe("applied");

  const before = css.split("\n");
  const after = readFileSync(path, "utf8").split("\n");
  expect(after).toHaveLength(before.length);

  const changed: number[] = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) changed.push(i);
  }

  expect(changed).toHaveLength(1);
  expect(before[changed[0]!]).toContain(edit.before);
  expect(after[changed[0]!]).toContain(edit.after);
}

describe("duplicate declarations", () => {
  it("shadcn: an edit patches only the first :root occurrence", () => {
    const css = [
      ":root {",
      "  --primary: red;",
      "}",
      ".dark {",
      "  --primary: navy;",
      "}",
      ":root {",
      "  --primary: red;",
      "}",
      "",
    ].join("\n");
    expectSingleLineEdit(css, {
      name: "--primary",
      value: "blue",
      before: "--primary: red;",
      after: "--primary: blue;",
    });
  });

  it("emdash: an edit patches only the first :root occurrence", () => {
    const css = [
      ":root {",
      "  --color-bg: light-dark(#fff, #000);",
      "}",
      ":root {",
      "  --color-bg: light-dark(#fff, #000);",
      "}",
      "",
    ].join("\n");
    expectSingleLineEdit(css, {
      name: "--color-bg",
      value: { light: "#eee" },
      before: "--color-bg: light-dark(#fff, #000);",
      after: "--color-bg: light-dark(#eee, #000);",
    });
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
