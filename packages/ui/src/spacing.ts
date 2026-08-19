import type { Token } from "@fittingroom/core";

/**
 * A value the density multiplier can scale: one signed number with one
 * unit. Anything else (calc(), var(), keywords) is left to hand edits.
 */
const SCALABLE_LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]+)$/i;

/** The value an edit replaces: the raw value, or the light half of a pair. */
export function baseValue(token: Token): string {
  return token.value.raw ?? token.value.light ?? "";
}

/**
 * Spacing tokens are recognized by the `--spacing` namespace both v1
 * dialects use, not by a category field — mirroring how the color editor
 * recognizes colors by value shape.
 */
export function isSpacingToken(token: Token): boolean {
  return /^--spacing(-|$)/.test(token.name) && SCALABLE_LENGTH.test(baseValue(token));
}

/** Multiplies a length's number, keeping its unit. Unparseable values pass through. */
export function scaleLength(value: string, factor: number): string {
  const match = SCALABLE_LENGTH.exec(value);
  if (!match) return value;
  const [, number, unit] = match;
  return `${Number((Number(number) * factor).toFixed(4))}${unit}`;
}

/**
 * The computed spacing edits: every spacing token's base (its per-token
 * override, or its original value) scaled by the density. Tokens whose
 * computed value equals the original need no edit and are omitted.
 */
export function spacingEdits(
  tokens: Token[],
  density: number,
  bases: Record<string, string>,
): Record<string, string> {
  const edits: Record<string, string> = {};
  for (const token of tokens) {
    if (!isSpacingToken(token)) continue;
    const original = baseValue(token);
    const computed = scaleLength(bases[token.name] ?? original, density);
    if (computed !== original) edits[token.name] = computed;
  }
  return edits;
}
