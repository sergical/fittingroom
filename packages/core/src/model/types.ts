/** A category hint used by the laboratory UI to group and render tokens. */
export type TokenCategory =
  | "color"
  | "font"
  | "spacing"
  | "radius"
  | "shadow"
  | "other";

/**
 * A token's value. `raw` is the value as written in a single-value
 * declaration (e.g. `--radius: 0.5rem`). `light`/`dark` are set instead
 * when the source uses a light/dark pair, either via a matching `.dark`
 * rule (shadcn dialect) or a `light-dark()` function call (emdash dialect).
 */
export interface TokenValue {
  raw?: string;
  light?: string;
  dark?: string;
}

/** A single CSS custom property, shaped for a DTCG-style token model. */
export interface Token {
  /** The CSS custom property name, e.g. "--primary". */
  name: string;
  value: TokenValue;
  category?: TokenCategory;
}

/**
 * The complete set of tokens read from a host app, tagged with the
 * dialect the source was read in.
 */
export interface TokenDocument {
  tokens: Token[];
  dialect: "shadcn" | "emdash";
}
