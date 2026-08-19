import type { Token } from "@fittingroom/core";

/** A length a shadow slider drives: its number and the unit it keeps. */
export interface ShadowLength {
  value: number;
  unit: string;
}

/**
 * One box-shadow layer decomposed for the sliders tab. The token itself
 * always stores the composed string; this shape exists only between
 * parseShadow and composeShadow.
 */
export interface DecomposedShadow {
  inset: boolean;
  offsetX: ShadowLength;
  offsetY: ShadowLength;
  blur: ShadowLength;
  spread: ShadowLength;
  /** The layer's color part verbatim, or "" when the shadow has none. */
  color: string;
}

const LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i;

/**
 * Shadow tokens are recognized by the explicit category when the source
 * provides one, or by the `--shadow` namespace both v1 dialects use.
 * Values the sliders cannot decompose (multi-layer, var()) still appear
 * in the editor for presets and hand edits.
 */
export function isShadowToken(token: Token): boolean {
  return token.category === "shadow" || /^--shadow(-|$)/.test(token.name);
}

/** Splits a value on whitespace, keeping function calls like rgb() whole. */
function topLevelParts(value: string): string[] | null {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    // A top-level comma separates shadow layers; the sliders drive one.
    if (char === "," && depth === 0) return null;
    if (/\s/.test(char) && depth === 0) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Decomposes a single box-shadow layer into slider parts, or returns
 * null for a value the sliders cannot represent — multiple layers, a
 * length count outside 2–4, more than one color, or a var()/keyword
 * value. Missing blur and spread read as zero.
 */
export function parseShadow(value: string): DecomposedShadow | null {
  const parts = topLevelParts(value);
  if (!parts) return null;
  const lengths: ShadowLength[] = [];
  let inset = false;
  let color = "";
  for (const part of parts) {
    const match = LENGTH.exec(part);
    if (match) {
      lengths.push({ value: Number(match[1]), unit: match[2] });
    } else if (part === "inset") {
      inset = true;
    } else if (color === "" && !part.includes("var(")) {
      color = part;
    } else {
      return null;
    }
  }
  if (lengths.length < 2 || lengths.length > 4) return null;
  const zero: ShadowLength = { value: 0, unit: "" };
  const [offsetX, offsetY, blur = zero, spread = zero] = lengths;
  return { inset, offsetX, offsetY, blur, spread, color };
}

function serializeLength({ value, unit }: ShadowLength): string {
  const rounded = Number(value.toFixed(4));
  if (rounded === 0 && unit === "") return "0";
  return `${rounded}${unit || "px"}`;
}

/**
 * Composes the slider parts back into the one string the token stores:
 * `[inset] x y blur spread [color]`. Blur and spread are always written
 * so a slider round-trip is stable.
 */
export function composeShadow(shadow: DecomposedShadow): string {
  const parts = [
    ...(shadow.inset ? ["inset"] : []),
    serializeLength(shadow.offsetX),
    serializeLength(shadow.offsetY),
    serializeLength(shadow.blur),
    serializeLength(shadow.spread),
    ...(shadow.color ? [shadow.color] : []),
  ];
  return parts.join(" ");
}

/**
 * The presets tab's choices. Single-layer on purpose: a picked preset
 * stays decomposable, so the sliders tab can tune it afterwards.
 */
export const SHADOW_PRESETS: ReadonlyArray<{ name: string; value: string }> = [
  { name: "none", value: "0 0 #0000" },
  { name: "sm", value: "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
  { name: "md", value: "0 4px 6px -1px rgb(0 0 0 / 0.1)" },
  { name: "lg", value: "0 10px 15px -3px rgb(0 0 0 / 0.1)" },
  { name: "xl", value: "0 20px 25px -5px rgb(0 0 0 / 0.1)" },
];
