import type { Token } from "@fittingroom/core";

/**
 * One auditionable Google Font: its family name as Google Fonts spells
 * it, and the generic fallback appended when the token's value has no
 * fallback stack of its own.
 */
export interface GoogleFont {
  family: string;
  fallback: "sans-serif" | "serif" | "monospace";
}

/**
 * A curated slice of Google Fonts, not the full catalog: enough to
 * audition a direction in each genre without an API dependency — the
 * text input still takes any family by hand.
 */
export const GOOGLE_FONTS: readonly GoogleFont[] = [
  { family: "DM Sans", fallback: "sans-serif" },
  { family: "Figtree", fallback: "sans-serif" },
  { family: "Inter", fallback: "sans-serif" },
  { family: "Lato", fallback: "sans-serif" },
  { family: "Manrope", fallback: "sans-serif" },
  { family: "Montserrat", fallback: "sans-serif" },
  { family: "Nunito", fallback: "sans-serif" },
  { family: "Open Sans", fallback: "sans-serif" },
  { family: "Plus Jakarta Sans", fallback: "sans-serif" },
  { family: "Poppins", fallback: "sans-serif" },
  { family: "Raleway", fallback: "sans-serif" },
  { family: "Roboto", fallback: "sans-serif" },
  { family: "Source Sans 3", fallback: "sans-serif" },
  { family: "Work Sans", fallback: "sans-serif" },
  { family: "Libre Baskerville", fallback: "serif" },
  { family: "Lora", fallback: "serif" },
  { family: "Merriweather", fallback: "serif" },
  { family: "Playfair Display", fallback: "serif" },
  { family: "Source Serif 4", fallback: "serif" },
  { family: "Fira Code", fallback: "monospace" },
  { family: "IBM Plex Mono", fallback: "monospace" },
  { family: "JetBrains Mono", fallback: "monospace" },
  { family: "Source Code Pro", fallback: "monospace" },
  { family: "Space Mono", fallback: "monospace" },
];

export function googleFontByFamily(family: string): GoogleFont | undefined {
  return GOOGLE_FONTS.find((font) => font.family === family);
}

/**
 * Font tokens are recognized by the explicit category when the source
 * provides one, or by the `--font` namespace both v1 dialects use.
 */
export function isFontToken(token: Token): boolean {
  return token.category === "font" || /^--font(-|$)/.test(token.name);
}

/** The first family in a font-family stack, without its quotes. */
export function primaryFamily(value: string): string {
  const first = value.split(",")[0].trim();
  return first.replace(/^(['"])(.*)\1$/, "$2");
}

/**
 * The value a picked font produces: the quoted family in front of the
 * token's existing fallback stack, so a hand-tuned stack survives the
 * audition. A value with no fallbacks gains the font's generic one —
 * a committed family the app never loads must still degrade sanely.
 */
export function withFamily(value: string, font: GoogleFont): string {
  const fallbacks = value.split(",").slice(1).map((family) => family.trim());
  if (fallbacks.length === 0) fallbacks.push(font.fallback);
  return [`"${font.family}"`, ...fallbacks].join(", ");
}

/** Weights the audition and the handed-over import both cover. */
const WEIGHTS = "400;500;600;700";

/** One css2 stylesheet URL loading every given family. */
export function googleFontsUrl(families: string[]): string {
  const params = families
    .map((family) => `family=${family.replaceAll(" ", "+")}:wght@${WEIGHTS}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/**
 * The import handed over after a commit. fittingroom never guesses how
 * the app loads fonts, so loading stays the developer's move: they paste
 * this wherever their app's CSS begins.
 */
export function fontImportSnippet(families: string[]): string {
  return `@import url('${googleFontsUrl(families)}');`;
}
