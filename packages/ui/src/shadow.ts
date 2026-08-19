import type { Token } from "@fittingroom/core";

/**
 * A length a shadow slider drives: its number and the unit it keeps.
 * `raw` holds the token's original text so an untouched length is
 * written back verbatim; a slider edit drops it.
 */
export interface ShadowLength {
  value: number;
  unit: string;
  raw?: string;
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
/** Functional lengths the sliders cannot drive and must not corrupt. */
const MATH_FUNCTION = /^(calc|min|max|clamp)\(/i;

/**
 * Shadow tokens are recognized by the explicit category when the source
 * provides one, or by the `--shadow` namespace both v1 dialects use.
 * Values the sliders cannot decompose (calc() lengths, keyword values)
 * still appear in the editor for presets and hand edits.
 */
export function isShadowToken(token: Token): boolean {
  return token.category === "shadow" || /^--shadow(-|$)/.test(token.name);
}

/** Splits a value on top-level commas: one string per shadow layer. */
function splitLayers(value: string): string[] {
  const layers: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      layers.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  layers.push(current);
  return layers;
}

/** Splits a layer on whitespace, keeping function calls like rgb() whole. */
function topLevelParts(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
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
 * null for a layer the sliders cannot represent — a length count
 * outside 2–4, more than one color, a calc()-style length, or a bare
 * keyword value. A var() reference is accepted as the color part.
 * Missing blur and spread read as zero.
 */
export function parseShadow(value: string): DecomposedShadow | null {
  const layers = splitLayers(value);
  if (layers.length !== 1) return null;
  return parseLayer(layers[0]);
}

/**
 * Decomposes every layer of a box-shadow value, or returns null when
 * any layer resists the sliders — one text input then edits the whole
 * value instead of corrupting part of it.
 */
export function parseShadowLayers(value: string): DecomposedShadow[] | null {
  const layers = splitLayers(value).map(parseLayer);
  if (layers.some((layer) => layer === null)) return null;
  return layers as DecomposedShadow[];
}

function parseLayer(value: string): DecomposedShadow | null {
  const lengths: ShadowLength[] = [];
  let inset = false;
  let color = "";
  for (const part of topLevelParts(value)) {
    const match = LENGTH.exec(part);
    if (match) {
      lengths.push({ value: Number(match[1]), unit: match[2], raw: part });
    } else if (part === "inset") {
      inset = true;
    } else if (MATH_FUNCTION.test(part)) {
      return null;
    } else if (color === "") {
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

function serializeLength({ value, unit, raw }: ShadowLength): string {
  // An untouched length keeps its original text; rounding applies only
  // to values a slider produced.
  if (raw !== undefined) return raw;
  const rounded = Number(value.toFixed(4));
  if (rounded === 0 && unit === "") return "0";
  return `${rounded}${unit || "px"}`;
}

/**
 * Composes the slider parts back into one layer string:
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

/** Composes every layer back into the one string the token stores. */
export function composeShadowLayers(layers: DecomposedShadow[]): string {
  return layers.map(composeShadow).join(", ");
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
