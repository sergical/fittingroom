import type { TokenDocument } from "@fittingroom/core";

/**
 * The hosted demo's sample TokenDocument: shadcn-shaped, with at least
 * one token of every kind the lab renders a dedicated editor for
 * (color, radius, spacing, font, shadow), so a visitor meets each
 * control without installing anything.
 */
export const demoDocument: TokenDocument = {
  dialect: "shadcn",
  tokens: [
    {
      name: "--background",
      value: { light: "oklch(1 0 0)", dark: "oklch(0.145 0 0)" },
      category: "color",
    },
    {
      name: "--foreground",
      value: { light: "oklch(0.145 0 0)", dark: "oklch(0.985 0 0)" },
      category: "color",
    },
    {
      name: "--primary",
      value: { light: "oklch(0.205 0 0)", dark: "oklch(0.922 0 0)" },
      category: "color",
    },
    {
      name: "--primary-foreground",
      value: { light: "oklch(0.985 0 0)", dark: "oklch(0.205 0 0)" },
      category: "color",
    },
    {
      name: "--muted-foreground",
      value: { light: "oklch(0.556 0 0)", dark: "oklch(0.708 0 0)" },
      category: "color",
    },
    { name: "--radius", value: { light: "0.625rem" }, category: "radius" },
    { name: "--spacing", value: { light: "0.25rem" }, category: "spacing" },
    {
      name: "--font-sans",
      value: { light: "system-ui, sans-serif" },
      category: "font",
    },
    {
      name: "--shadow-md",
      value: {
        light:
          "0 4px 6px -1px oklch(0 0 0 / 0.1), 0 2px 4px -2px oklch(0 0 0 / 0.1)",
      },
      category: "shadow",
    },
  ],
};

/**
 * The globals.css a real host app would hold for `document`, in the
 * shadcn dialect. The demo's simulated commits diff two serializations
 * of the sample document, so the patch shown is exactly the change a
 * real install would have written to this file.
 */
export function sampleCss(document: TokenDocument): string {
  const declaration = (name: string, value: string | undefined) =>
    `  ${name}: ${value ?? ""};`;
  const light = document.tokens
    .map((token) => declaration(token.name, token.value.light ?? token.value.raw))
    .join("\n");
  const dark = document.tokens
    .filter((token) => token.value.dark !== undefined)
    .map((token) => declaration(token.name, token.value.dark))
    .join("\n");
  return `:root {\n${light}\n}\n\n.dark {\n${dark}\n}\n`;
}
