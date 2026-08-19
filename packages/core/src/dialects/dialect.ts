import type { Edits, TokenDocument } from "../model/types.js";

/**
 * The dialect seam inside TokenSource (ADR-0001): a token-authoring
 * convention in CSS, keyed by file content — never by host framework.
 * Implementation detail of TokenSource; not part of the public API.
 */
export interface Dialect {
  name: TokenDocument["dialect"];
  /** Content-based detection: does this CSS use the dialect's convention? */
  detect(css: string): boolean;
  parse(css: string): TokenDocument;
  /**
   * Patches declaration values in place, preserving everything else
   * byte-for-byte. When a token is declared more than once for the same
   * scheme, only the first declaration is patched — the one `parse`
   * models — so an edit always produces a single-hunk diff. With zero
   * edits this is the round-trip proof: `patch(css, {})` must return
   * `css` unchanged.
   */
  patch(css: string, edits: Edits): string;
}
