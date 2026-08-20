import { describe, expect, it } from "vitest";
import type { Token } from "@fittingroom/core";
import {
  fontImportSnippet,
  GOOGLE_FONTS,
  googleFontByFamily,
  googleFontsUrl,
  isFontToken,
  primaryFamily,
  withFamily,
} from "../src/font.js";

const token = (name: string, raw: string): Token => ({ name, value: { raw } });

describe("isFontToken", () => {
  it("accepts --font-* tokens holding a family stack", () => {
    expect(isFontToken(token("--font-sans", "system-ui, sans-serif"))).toBe(true);
    expect(isFontToken(token("--font-mono", "ui-monospace, monospace"))).toBe(true);
    expect(isFontToken(token("--font", "Georgia"))).toBe(true);
  });

  it("accepts tokens explicitly categorized as font", () => {
    expect(
      isFontToken({ name: "--body", value: { raw: "serif" }, category: "font" }),
    ).toBe(true);
  });

  it("rejects tokens outside the font namespace", () => {
    expect(isFontToken(token("--primary", "#4f46e5"))).toBe(false);
    expect(isFontToken(token("--fontx", "serif"))).toBe(false);
    expect(isFontToken(token("--spacing-md", "1rem"))).toBe(false);
  });

  it("rejects --font-* tokens holding non-family font properties", () => {
    expect(isFontToken(token("--font-size", "16px"))).toBe(false);
    expect(isFontToken(token("--font-size-lg", "1.25rem"))).toBe(false);
    expect(isFontToken(token("--font-weight-bold", "700"))).toBe(false);
    expect(isFontToken(token("--font-style", "italic"))).toBe(false);
    expect(isFontToken(token("--font-feature-settings", '"liga"'))).toBe(false);
  });
});

describe("primaryFamily", () => {
  it("returns the first family in the stack, unquoted", () => {
    expect(primaryFamily("system-ui, sans-serif")).toBe("system-ui");
    expect(primaryFamily('"Inter", sans-serif')).toBe("Inter");
    expect(primaryFamily("'Playfair Display', serif")).toBe("Playfair Display");
    expect(primaryFamily("Georgia")).toBe("Georgia");
  });

  it("keeps a comma inside a quoted family name", () => {
    expect(primaryFamily('"ACME, Inc.", sans-serif')).toBe("ACME, Inc.");
    expect(primaryFamily("'Foo, Bar', serif")).toBe("Foo, Bar");
  });
});

describe("withFamily", () => {
  const inter = googleFontByFamily("Inter")!;
  const lora = googleFontByFamily("Lora")!;

  it("replaces the first family and keeps the existing fallback stack", () => {
    expect(withFamily("system-ui, sans-serif", inter)).toBe('"Inter", sans-serif');
    expect(withFamily('"Roboto", Arial, sans-serif', inter)).toBe(
      '"Inter", Arial, sans-serif',
    );
  });

  it("appends the font's generic fallback when the value has none", () => {
    expect(withFamily("Georgia", lora)).toBe('"Lora", serif');
  });

  it("treats a quoted family containing a comma as one family", () => {
    expect(withFamily('"ACME, Inc.", sans-serif', inter)).toBe(
      '"Inter", sans-serif',
    );
    expect(withFamily('serif, "ACME, Inc.", sans-serif', inter)).toBe(
      '"Inter", "ACME, Inc.", sans-serif',
    );
  });
});

describe("googleFontsUrl", () => {
  it("builds one css2 URL covering every family", () => {
    expect(googleFontsUrl(["Inter"])).toBe(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    );
    expect(googleFontsUrl(["Playfair Display", "Inter"])).toBe(
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap",
    );
  });

  it("requests only the weights a family actually serves", () => {
    expect(googleFontsUrl(["Space Mono"])).toBe(
      "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap",
    );
    expect(googleFontsUrl(["Lato"])).toBe(
      "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap",
    );
  });
});

describe("fontImportSnippet", () => {
  it("is a CSS @import of the css2 URL", () => {
    expect(fontImportSnippet(["Inter"])).toBe(
      "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');",
    );
  });
});

describe("GOOGLE_FONTS", () => {
  it("holds unique families, each with a generic fallback", () => {
    const families = GOOGLE_FONTS.map((font) => font.family);
    expect(new Set(families).size).toBe(families.length);
    for (const font of GOOGLE_FONTS) {
      expect(["sans-serif", "serif", "monospace"]).toContain(font.fallback);
    }
  });

  it("is findable by family name", () => {
    expect(googleFontByFamily("Inter")?.fallback).toBe("sans-serif");
    expect(googleFontByFamily("Not A Font")).toBeUndefined();
  });
});
