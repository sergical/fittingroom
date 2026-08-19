import { describe, expect, it } from "vitest";
import type { Token } from "@fittingroom/core";
import {
  composeShadow,
  composeShadowLayers,
  isShadowToken,
  parseShadow,
  parseShadowLayers,
  SHADOW_PRESETS,
} from "../src/shadow.js";

const token = (name: string, raw: string): Token => ({ name, value: { raw } });

describe("isShadowToken", () => {
  it("accepts --shadow-* tokens", () => {
    expect(isShadowToken(token("--shadow", "0 1px 2px rgb(0 0 0 / 0.1)"))).toBe(true);
    expect(isShadowToken(token("--shadow-md", "0 4px 6px -1px #0002"))).toBe(true);
  });

  it("accepts tokens explicitly categorized as shadow", () => {
    expect(
      isShadowToken({
        name: "--elevation-1",
        value: { raw: "0 1px 2px #0002" },
        category: "shadow",
      }),
    ).toBe(true);
  });

  it("rejects tokens outside the shadow namespace", () => {
    expect(isShadowToken(token("--primary", "#4f46e5"))).toBe(false);
    expect(isShadowToken(token("--spacing-md", "1rem"))).toBe(false);
    expect(isShadowToken(token("--shadowy", "0 1px 2px #0002"))).toBe(false);
  });
});

describe("parseShadow", () => {
  it("decomposes offsets, blur, spread, and color", () => {
    expect(parseShadow("0 4px 6px -1px rgb(0 0 0 / 0.1)")).toEqual({
      inset: false,
      offsetX: { value: 0, unit: "", raw: "0" },
      offsetY: { value: 4, unit: "px", raw: "4px" },
      blur: { value: 6, unit: "px", raw: "6px" },
      spread: { value: -1, unit: "px", raw: "-1px" },
      color: "rgb(0 0 0 / 0.1)",
    });
  });

  it("defaults missing blur and spread to zero", () => {
    expect(parseShadow("1px 2px #0002")).toEqual({
      inset: false,
      offsetX: { value: 1, unit: "px", raw: "1px" },
      offsetY: { value: 2, unit: "px", raw: "2px" },
      blur: { value: 0, unit: "" },
      spread: { value: 0, unit: "" },
      color: "#0002",
    });
  });

  it("reads an inset flag and a colorless shadow", () => {
    expect(parseShadow("inset 0 2px 4px")).toEqual({
      inset: true,
      offsetX: { value: 0, unit: "", raw: "0" },
      offsetY: { value: 2, unit: "px", raw: "2px" },
      blur: { value: 4, unit: "px", raw: "4px" },
      spread: { value: 0, unit: "" },
      color: "",
    });
  });

  it("accepts a color written before the lengths", () => {
    expect(parseShadow("rgb(0 0 0 / 0.05) 0 1px 2px")?.color).toBe(
      "rgb(0 0 0 / 0.05)",
    );
  });

  it("accepts a var() reference as the color", () => {
    expect(parseShadow("0 1px 2px var(--shadow-color)")?.color).toBe(
      "var(--shadow-color)",
    );
  });

  it("refuses values the sliders cannot represent", () => {
    // multi-layer shadows, wrong length counts, and non-shadow values
    expect(parseShadow("0 1px 2px #0002, 0 1px 3px #0001")).toBeNull();
    expect(parseShadow("1px")).toBeNull();
    expect(parseShadow("1px 2px 3px 4px 5px")).toBeNull();
    expect(parseShadow("var(--shadow-md)")).toBeNull();
    expect(parseShadow("none")).toBeNull();
    expect(parseShadow("")).toBeNull();
  });

  it("refuses calc() lengths instead of misreading them as the color", () => {
    expect(parseShadow("0 1px calc(2px + 1vw)")).toBeNull();
    expect(parseShadow("0 min(1px, 0.5vw) 2px #0002")).toBeNull();
  });
});

describe("parseShadowLayers", () => {
  it("decomposes every layer of a multi-layer shadow", () => {
    const layers = parseShadowLayers("0 1px 2px #0002, 0 2px 4px #0001");
    expect(layers).toHaveLength(2);
    expect(layers?.[0].color).toBe("#0002");
    expect(layers?.[1].offsetY).toEqual({ value: 2, unit: "px", raw: "2px" });
  });

  it("round-trips a multi-layer shadow through composeShadowLayers", () => {
    const value = "0 1px 2px 0 #0002, inset 0 2px 4px 0 #0001";
    expect(composeShadowLayers(parseShadowLayers(value)!)).toBe(value);
  });

  it("refuses the whole value when any layer resists the sliders", () => {
    expect(parseShadowLayers("0 1px 2px #0002, var(--shadow-md)")).toBeNull();
    expect(parseShadowLayers("0 1px 2px #0002, 0 1px calc(2px + 1vw)")).toBeNull();
  });
});

describe("composeShadow", () => {
  it("round-trips what parseShadow read", () => {
    for (const value of [
      "0 4px 6px -1px rgb(0 0 0 / 0.1)",
      "inset 0 2px 4px 0 #0002",
    ]) {
      expect(composeShadow(parseShadow(value)!)).toBe(value);
    }
  });

  it("emits one composed string with canonical part order", () => {
    const parts = parseShadow("rgb(0 0 0 / 0.05) 0 1px 2px")!;
    expect(composeShadow(parts)).toBe("0 1px 2px 0 rgb(0 0 0 / 0.05)");
  });

  it("writes unitless slider values as px, keeping zero bare", () => {
    const parts = parseShadow("0 0 4px")!;
    expect(composeShadow({ ...parts, offsetY: { value: 2, unit: "" } })).toBe(
      "0 2px 4px 0",
    );
  });

  it("rounds slider values to at most four decimals", () => {
    const parts = parseShadow("0 1px 2px #0002")!;
    expect(
      composeShadow({ ...parts, blur: { value: 2 / 3, unit: "rem" } }),
    ).toBe("0 1px 0.6667rem 0 #0002");
  });

  it("writes untouched lengths back verbatim, without re-rounding", () => {
    const parts = parseShadow("0.123456rem 0.234567rem 0.345678rem #000")!;
    expect(composeShadow({ ...parts, color: "#111" })).toBe(
      "0.123456rem 0.234567rem 0.345678rem 0 #111",
    );
  });
});

describe("SHADOW_PRESETS", () => {
  it("every preset except none decomposes for the sliders tab", () => {
    for (const preset of SHADOW_PRESETS) {
      if (preset.name === "none") continue;
      expect(parseShadow(preset.value), preset.name).not.toBeNull();
    }
  });

  it("offers a none preset that clears the shadow", () => {
    const none = SHADOW_PRESETS.find((preset) => preset.name === "none");
    expect(none?.value).toBe("0 0 #0000");
  });
});
