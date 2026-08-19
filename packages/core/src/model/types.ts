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

/**
 * A proposed change to one token. A string replaces the declaration's
 * raw value where the token is declared (its light declaration, in a
 * dialect that keeps light and dark apart). The object form targets the
 * light and/or dark half by scheme; each dialect maps the halves onto
 * its own convention (`.dark` rules, `light-dark()` calls), so callers
 * never need to know how a scheme is spelled in the file.
 */
export type Edit = string | { light?: string; dark?: string };

/** Proposed changes keyed by custom-property name. */
export type Edits = Record<string, Edit>;

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
