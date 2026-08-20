import type { Edit, Token, TokenDocument } from "@fittingroom/core";

/** The color scheme the Preview shows; edits target the scheme on show. */
export type Scheme = "light" | "dark";

/**
 * A token holds a pair when light and dark halves exist separately —
 * as opposed to one raw value, or a lone light declaration that
 * cascades into dark mode unchanged.
 */
function isPaired(token: Token): boolean {
  return token.value.raw === undefined && token.value.dark !== undefined;
}

/** The original value the previewed scheme shows for a token. */
export function schemeValue(token: Token, scheme: Scheme): string {
  if (token.value.raw !== undefined) return token.value.raw;
  if (scheme === "dark" && token.value.dark !== undefined) {
    return token.value.dark;
  }
  return token.value.light ?? "";
}

/**
 * The half of a draft the previewed scheme shows, or undefined when the
 * draft leaves that scheme alone. A bare string on a paired token is a
 * legacy draft from before scheme targeting existed: a light-half edit.
 */
export function draftedValue(
  draft: Edit | undefined,
  token: Token,
  scheme: Scheme,
): string | undefined {
  if (draft === undefined) return undefined;
  if (!isPaired(token)) {
    // One value serves both schemes, exactly as its commit would.
    return typeof draft === "string" ? draft : draft.light;
  }
  if (typeof draft === "string") {
    return scheme === "light" ? draft : undefined;
  }
  return draft[scheme];
}

/**
 * Folds one input change into the draft set, targeting the previewed
 * scheme's half of a paired token and leaving the other half alone. A
 * half set back to its original value drops out; a draft with no halves
 * left drops entirely, so an untouched token never carries an edit.
 */
export function withDraft(
  drafts: Record<string, Edit>,
  token: Token,
  scheme: Scheme,
  value: string,
): Record<string, Edit> {
  const { [token.name]: previous, ...rest } = drafts;
  if (!isPaired(token)) {
    if (value === schemeValue(token, scheme)) return rest;
    return { ...rest, [token.name]: value };
  }
  const other: Scheme = scheme === "light" ? "dark" : "light";
  const next: { light?: string; dark?: string } = {};
  const otherHalf = draftedValue(previous, token, other);
  if (otherHalf !== undefined) next[other] = otherHalf;
  if (value !== token.value[scheme]) next[scheme] = value;
  if (next.light === undefined && next.dark === undefined) return rest;
  return { ...rest, [token.name]: next };
}

/**
 * The preview client owns two override rules — one active without the
 * host's `.dark` class, one active with it — so a light-half edit never
 * leaks into dark mode or vice versa.
 */
export interface PreviewBuckets {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/**
 * Splits an edit set across the preview client's two override rules.
 * shadcn pairs go half to each rule; an emdash pair composes into one
 * `light-dark()` value for both rules, letting the previewed
 * color-scheme pick the half; a single-valued edit lands in both rules
 * because its committed declaration would cascade into both schemes.
 */
export function previewBuckets(
  document: TokenDocument | null,
  edits: Record<string, Edit>,
): PreviewBuckets {
  const buckets: PreviewBuckets = { light: {}, dark: {} };
  for (const [name, draft] of Object.entries(edits)) {
    const token = document?.tokens.find((candidate) => candidate.name === name);
    const light = typeof draft === "string" ? draft : draft.light;
    const dark = typeof draft === "string" ? undefined : draft.dark;
    if (token && isPaired(token)) {
      if (document?.dialect === "emdash") {
        const composed = `light-dark(${light ?? token.value.light}, ${
          dark ?? token.value.dark
        })`;
        buckets.light[name] = composed;
        buckets.dark[name] = composed;
      } else {
        if (light !== undefined) buckets.light[name] = light;
        if (dark !== undefined) buckets.dark[name] = dark;
      }
    } else if (token) {
      const value = light ?? dark;
      if (value !== undefined) {
        buckets.light[name] = value;
        buckets.dark[name] = value;
      }
    } else {
      // The token is unknown: the document read is still in flight (or
      // the draft is stale). Route each half only to its own rule — a
      // persisted dark draft must never flash in the light preview, or
      // vice versa, while the document loads. A bare string might be a
      // raw value or a legacy light-half edit; the light rule is the
      // safe home for it, and the re-push on document arrival corrects
      // any transient under-preview.
      if (light !== undefined) buckets.light[name] = light;
      if (dark !== undefined) buckets.dark[name] = dark;
    }
  }
  return buckets;
}
