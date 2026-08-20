import { describe, expect, it } from "vitest";
import type { Token, TokenDocument } from "@fittingroom/core";
import {
  draftedValue,
  previewBuckets,
  schemeValue,
  withDraft,
} from "../src/scheme.js";

const paired: Token = {
  name: "--primary",
  value: { light: "#4f46e5", dark: "#818cf8" },
};
const lightOnly: Token = { name: "--border", value: { light: "#e7e5e4" } };
const raw: Token = { name: "--radius", value: { raw: "0.5rem" } };

const shadcnDocument = (tokens: Token[]): TokenDocument => ({
  tokens,
  dialect: "shadcn",
});
const emdashDocument = (tokens: Token[]): TokenDocument => ({
  tokens,
  dialect: "emdash",
});

describe("schemeValue", () => {
  it("shows a pair's half for the previewed scheme", () => {
    expect(schemeValue(paired, "light")).toBe("#4f46e5");
    expect(schemeValue(paired, "dark")).toBe("#818cf8");
  });

  it("shows the light value in dark for a token with no dark half", () => {
    // A lone :root declaration cascades into dark mode unchanged.
    expect(schemeValue(lightOnly, "dark")).toBe("#e7e5e4");
  });

  it("shows a raw value in either scheme", () => {
    expect(schemeValue(raw, "light")).toBe("0.5rem");
    expect(schemeValue(raw, "dark")).toBe("0.5rem");
  });
});

describe("withDraft and draftedValue", () => {
  it("targets the half of the previewed scheme, leaving the other alone", () => {
    const drafts = withDraft({}, paired, "dark", "#00ff00");
    expect(drafts).toEqual({ "--primary": { dark: "#00ff00" } });
    expect(draftedValue(drafts["--primary"], paired, "dark")).toBe("#00ff00");
    expect(draftedValue(drafts["--primary"], paired, "light")).toBeUndefined();
  });

  it("keeps independently drafted halves together on one token", () => {
    const drafts = withDraft(
      withDraft({}, paired, "light", "#ff0000"),
      paired,
      "dark",
      "#00ff00",
    );
    expect(drafts).toEqual({
      "--primary": { light: "#ff0000", dark: "#00ff00" },
    });
  });

  it("drops a half that returns to its original value", () => {
    const both = withDraft(
      withDraft({}, paired, "light", "#ff0000"),
      paired,
      "dark",
      "#00ff00",
    );
    const darkReset = withDraft(both, paired, "dark", "#818cf8");
    expect(darkReset).toEqual({ "--primary": { light: "#ff0000" } });
    expect(withDraft(darkReset, paired, "light", "#4f46e5")).toEqual({});
  });

  it("drafts an unpaired token as one value shown in both schemes", () => {
    const drafts = withDraft({}, lightOnly, "dark", "#333333");
    expect(drafts).toEqual({ "--border": "#333333" });
    expect(draftedValue(drafts["--border"], lightOnly, "light")).toBe("#333333");
    expect(draftedValue(drafts["--border"], lightOnly, "dark")).toBe("#333333");
    expect(withDraft(drafts, lightOnly, "light", "#e7e5e4")).toEqual({});
  });

  it("drafts a raw token as a bare string in either scheme", () => {
    expect(withDraft({}, raw, "dark", "1rem")).toEqual({ "--radius": "1rem" });
    expect(withDraft({ "--radius": "1rem" }, raw, "dark", "0.5rem")).toEqual({});
  });

  it("reads a legacy string draft on a paired token as its light half", () => {
    // Drafts persisted before scheme targeting existed were light-half strings.
    expect(draftedValue("#ff0000", paired, "light")).toBe("#ff0000");
    expect(draftedValue("#ff0000", paired, "dark")).toBeUndefined();
  });
});

describe("previewBuckets", () => {
  it("routes a shadcn pair's halves to their own override rules", () => {
    const buckets = previewBuckets(shadcnDocument([paired]), {
      "--primary": { light: "#ff0000", dark: "#00ff00" },
    });
    expect(buckets.light).toEqual({ "--primary": "#ff0000" });
    expect(buckets.dark).toEqual({ "--primary": "#00ff00" });
  });

  it("routes a lone dark-half edit only to the dark rule", () => {
    const buckets = previewBuckets(shadcnDocument([paired]), {
      "--primary": { dark: "#00ff00" },
    });
    expect(buckets.light).toEqual({});
    expect(buckets.dark).toEqual({ "--primary": "#00ff00" });
  });

  it("applies an unpaired or raw edit in both rules, as a commit would", () => {
    const buckets = previewBuckets(shadcnDocument([lightOnly, raw]), {
      "--border": "#333333",
      "--radius": "1rem",
    });
    expect(buckets.light).toEqual({ "--border": "#333333", "--radius": "1rem" });
    expect(buckets.dark).toEqual({ "--border": "#333333", "--radius": "1rem" });
  });

  it("composes an emdash pair into one light-dark() value for both rules", () => {
    const buckets = previewBuckets(emdashDocument([paired]), {
      "--primary": { dark: "#00ff00" },
    });
    const composed = "light-dark(#4f46e5, #00ff00)";
    expect(buckets.light).toEqual({ "--primary": composed });
    expect(buckets.dark).toEqual({ "--primary": composed });
  });

  it("reads a legacy string draft on a paired token as its light half", () => {
    const buckets = previewBuckets(shadcnDocument([paired]), {
      "--primary": "#ff0000",
    });
    expect(buckets.light).toEqual({ "--primary": "#ff0000" });
    expect(buckets.dark).toEqual({});
  });

  it("keeps a dark-half draft out of the light rule while the document loads", () => {
    const buckets = previewBuckets(null, { "--primary": { dark: "#00ff00" } });
    expect(buckets.light).toEqual({});
    expect(buckets.dark).toEqual({ "--primary": "#00ff00" });
  });

  it("routes an unknown token's halves only to their own rules", () => {
    const buckets = previewBuckets(shadcnDocument([raw]), {
      "--stale": { light: "#ff0000", dark: "#00ff00" },
      "--stale-string": "#0000ff",
    });
    expect(buckets.light).toEqual({
      "--stale": "#ff0000",
      "--stale-string": "#0000ff",
    });
    expect(buckets.dark).toEqual({ "--stale": "#00ff00" });
  });
});
