import type { Token } from "@fittingroom/core";

/**
 * One value the density multiplier can scale: a signed number with an
 * optional unit (`0` and other unitless numbers count). Shorthand values
 * are handled part by part in scaleLength.
 */
const SCALABLE_LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i;

/** The value an edit replaces: the raw value, or the light half of a pair. */
export function baseValue(token: Token): string {
  return token.value.raw ?? token.value.light ?? "";
}

/**
 * Spacing tokens are recognized by the explicit category when the source
 * provides one, or by the `--spacing` namespace both v1 dialects use.
 * Values the multiplier cannot scale (calc(), var(), keywords) still
 * appear in the editor for hand edits; scaleLength passes them through.
 */
export function isSpacingToken(token: Token): boolean {
  return token.category === "spacing" || /^--spacing(-|$)/.test(token.name);
}

function scaleOne(value: string, factor: number): string | null {
  const match = SCALABLE_LENGTH.exec(value);
  if (!match) return null;
  const [, number, unit] = match;
  return `${Number((Number(number) * factor).toFixed(4))}${unit}`;
}

/**
 * Multiplies each length in a value — a single length or a shorthand
 * list like `8px 16px` — keeping units. A factor of 1 passes the value
 * through verbatim so an untouched token never gains a lexical edit
 * (e.g. `1.0rem` staying `1.0rem`, not becoming `1rem`). A value with
 * any part the multiplier cannot parse passes through unchanged.
 */
export function scaleLength(value: string, factor: number): string {
  if (factor === 1) return value;
  const scaled = value.trim().split(/\s+/).map((part) => scaleOne(part, factor));
  if (scaled.some((part) => part === null)) return value;
  return scaled.join(" ");
}

/**
 * A computed spacing edit: a bare string for a single-valued token, or
 * both halves of a light/dark pair — the density scales the dark half
 * too, while a per-token base override replaces only the light half
 * (mirroring the color editor's light-half semantics).
 */
export type SpacingEdit = string | { light: string; dark: string };

/**
 * The computed spacing edits: every spacing token's base (its per-token
 * override, or its original value) scaled by the density. Tokens whose
 * computed value equals the original need no edit and are omitted.
 */
export function spacingEdits(
  tokens: Token[],
  density: number,
  bases: Record<string, string>,
): Record<string, SpacingEdit> {
  const edits: Record<string, SpacingEdit> = {};
  for (const token of tokens) {
    if (!isSpacingToken(token)) continue;
    const original = baseValue(token);
    const light = scaleLength(bases[token.name] ?? original, density);
    const originalDark = token.value.raw === undefined ? token.value.dark : undefined;
    if (originalDark !== undefined) {
      const dark = scaleLength(originalDark, density);
      if (light !== original || dark !== originalDark) {
        edits[token.name] = { light, dark };
      }
    } else if (light !== original) {
      edits[token.name] = light;
    }
  }
  return edits;
}
