import { describe, expect, it } from "vitest";
import type { Token } from "@fittingroom/core";
import { isSpacingToken, scaleLength, spacingEdits } from "../src/spacing.js";

const token = (name: string, raw: string): Token => ({ name, value: { raw } });

describe("isSpacingToken", () => {
  it("accepts --spacing-* tokens holding a simple length", () => {
    expect(isSpacingToken(token("--spacing-md", "1rem"))).toBe(true);
    expect(isSpacingToken(token("--spacing", "0.25rem"))).toBe(true);
    expect(isSpacingToken(token("--spacing-sm", "12px"))).toBe(true);
  });

  it("rejects tokens outside the spacing namespace", () => {
    expect(isSpacingToken(token("--radius", "0.5rem"))).toBe(false);
    expect(isSpacingToken(token("--primary", "#4f46e5"))).toBe(false);
    expect(isSpacingToken(token("--spacingx", "1rem"))).toBe(false);
  });

  it("rejects spacing names whose value the multiplier cannot scale", () => {
    expect(isSpacingToken(token("--spacing-md", "calc(1rem + 2px)"))).toBe(false);
    expect(isSpacingToken(token("--spacing-md", "var(--base)"))).toBe(false);
  });
});

describe("scaleLength", () => {
  it("multiplies the number and keeps the unit", () => {
    expect(scaleLength("1rem", 1.5)).toBe("1.5rem");
    expect(scaleLength("0.25rem", 2)).toBe("0.5rem");
    expect(scaleLength("12px", 0.5)).toBe("6px");
    expect(scaleLength("-0.5rem", 2)).toBe("-1rem");
  });

  it("rounds to at most four decimals", () => {
    expect(scaleLength("1rem", 2 / 3)).toBe("0.6667rem");
  });

  it("returns a value it cannot parse unchanged", () => {
    expect(scaleLength("calc(1rem + 2px)", 2)).toBe("calc(1rem + 2px)");
  });
});

describe("spacingEdits", () => {
  const tokens: Token[] = [
    token("--spacing-sm", "0.5rem"),
    token("--spacing-md", "1rem"),
    token("--primary", "#4f46e5"),
  ];

  it("is empty at density 1 with no overrides", () => {
    expect(spacingEdits(tokens, 1, {})).toEqual({});
  });

  it("scales every spacing token by the density, leaving other tokens alone", () => {
    expect(spacingEdits(tokens, 2, {})).toEqual({
      "--spacing-sm": "1rem",
      "--spacing-md": "2rem",
    });
  });

  it("composes a per-token base override with the density", () => {
    expect(spacingEdits(tokens, 1.5, { "--spacing-md": "2rem" })).toEqual({
      "--spacing-sm": "0.75rem",
      "--spacing-md": "3rem",
    });
  });

  it("omits a token whose computed value equals its original", () => {
    expect(spacingEdits(tokens, 1, { "--spacing-md": "1rem" })).toEqual({});
  });
});
