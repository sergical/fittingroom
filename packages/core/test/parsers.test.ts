import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseShadcn } from "../src/parsers/shadcn.js";
import { parseEmdash } from "../src/parsers/emdash.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf8",
  );
}

describe("parseShadcn", () => {
  const css = fixture("shadcn-globals.css");

  it("finds tokens with light and dark values", () => {
    const { tokens, dialect } = parseShadcn(css);
    expect(dialect).toBe("shadcn");

    const byName = new Map(tokens.map((t) => [t.name, t]));
    expect(byName.get("--primary")?.value).toEqual({
      light: "oklch(0.205 0 0)",
      dark: "oklch(0.922 0 0)",
    });
    expect(byName.get("--background")?.value).toEqual({
      light: "oklch(1 0 0)",
      dark: "oklch(0.145 0 0)",
    });
    // --radius only appears in :root, so it has no dark half.
    expect(byName.get("--radius")?.value).toEqual({
      light: "0.625rem",
      dark: undefined,
    });
    expect(tokens).toHaveLength(11);
  });
});

describe("parseEmdash", () => {
  const css = fixture("emdash-tokens.css");

  it("finds tokens nested inside @layer base", () => {
    const { tokens, dialect } = parseEmdash(css);
    expect(dialect).toBe("emdash");
    expect(tokens).toHaveLength(6);
  });

  it("splits light-dark() values into a light/dark pair", () => {
    const { tokens } = parseEmdash(css);
    const byName = new Map(tokens.map((t) => [t.name, t]));

    expect(byName.get("--color-bg")?.value).toEqual({
      light: "#ffffff",
      dark: "#0a0a0a",
    });
    expect(byName.get("--color-brand")?.value).toEqual({
      light: "oklch(0.6 0.2 260)",
      dark: "oklch(0.75 0.2 260)",
    });
  });

  it("keeps non-light-dark() values as a single raw value", () => {
    const { tokens } = parseEmdash(css);
    const byName = new Map(tokens.map((t) => [t.name, t]));

    expect(byName.get("--spacing-md")?.value).toEqual({ raw: "1rem" });
    expect(byName.get("--radius-md")?.value).toEqual({ raw: "0.5rem" });
  });
});
