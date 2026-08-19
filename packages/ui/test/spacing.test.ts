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

  it("accepts shorthand, zero, and hand-edit-only spacing values", () => {
    expect(isSpacingToken(token("--spacing-inset", "8px 16px"))).toBe(true);
    expect(isSpacingToken(token("--spacing-none", "0"))).toBe(true);
    expect(isSpacingToken(token("--spacing-md", "calc(1rem + 2px)"))).toBe(true);
    expect(isSpacingToken(token("--spacing-md", "var(--base)"))).toBe(true);
  });

  it("accepts tokens explicitly categorized as spacing", () => {
    expect(
      isSpacingToken({ name: "--inset", value: { raw: "1rem" }, category: "spacing" }),
    ).toBe(true);
  });

  it("rejects tokens outside the spacing namespace", () => {
    expect(isSpacingToken(token("--radius", "0.5rem"))).toBe(false);
    expect(isSpacingToken(token("--primary", "#4f46e5"))).toBe(false);
    expect(isSpacingToken(token("--spacingx", "1rem"))).toBe(false);
  });
});

describe("scaleLength", () => {
  it("multiplies the number and keeps the unit", () => {
    expect(scaleLength("1rem", 1.5)).toBe("1.5rem");
    expect(scaleLength("0.25rem", 2)).toBe("0.5rem");
    expect(scaleLength("12px", 0.5)).toBe("6px");
    expect(scaleLength("-0.5rem", 2)).toBe("-1rem");
  });

  it("scales every length in a shorthand value", () => {
    expect(scaleLength("8px 16px", 2)).toBe("16px 32px");
    expect(scaleLength("1rem 2rem 3rem 4rem", 0.5)).toBe("0.5rem 1rem 1.5rem 2rem");
  });

  it("scales unitless numbers, including zero", () => {
    expect(scaleLength("0", 2)).toBe("0");
    expect(scaleLength("2", 1.5)).toBe("3");
  });

  it("rounds to at most four decimals", () => {
    expect(scaleLength("1rem", 2 / 3)).toBe("0.6667rem");
  });

  it("passes a value through verbatim at factor 1", () => {
    expect(scaleLength("1.0rem", 1)).toBe("1.0rem");
    expect(scaleLength(".5rem", 1)).toBe(".5rem");
  });

  it("returns a value it cannot parse unchanged", () => {
    expect(scaleLength("calc(1rem + 2px)", 2)).toBe("calc(1rem + 2px)");
    expect(scaleLength("8px auto", 2)).toBe("8px auto");
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

  it("never invents a lexical edit for an untouched token at density 1", () => {
    expect(spacingEdits([token("--spacing-md", "1.0rem")], 1, {})).toEqual({});
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

  it("composes a shorthand override with the density", () => {
    expect(
      spacingEdits([token("--spacing-inset", "4px 8px")], 2, {
        "--spacing-inset": "8px 16px",
      }),
    ).toEqual({ "--spacing-inset": "16px 32px" });
  });

  it("omits a token whose computed value equals its original", () => {
    expect(spacingEdits(tokens, 1, { "--spacing-md": "1rem" })).toEqual({});
  });

  it("scales both halves of a light/dark pair", () => {
    const paired: Token = {
      name: "--spacing-md",
      value: { light: "1rem", dark: "0.75rem" },
    };
    expect(spacingEdits([paired], 2, {})).toEqual({
      "--spacing-md": { light: "2rem", dark: "1.5rem" },
    });
  });

  it("keeps the scaled dark half alongside a light-half override", () => {
    const paired: Token = {
      name: "--spacing-md",
      value: { light: "1rem", dark: "0.75rem" },
    };
    expect(spacingEdits([paired], 2, { "--spacing-md": "0.5rem" })).toEqual({
      "--spacing-md": { light: "1rem", dark: "1.5rem" },
    });
  });
});
