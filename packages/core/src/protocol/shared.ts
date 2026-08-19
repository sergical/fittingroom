import type { Edit, Edits, TokenDocument, TokenValue } from "../model/types.js";

/**
 * Merges edits into a TokenDocument the way a dialect would write them:
 * a string edit replaces the raw value of a single-value token and the
 * light half of a paired one; an object edit targets the named halves.
 * Names that match no token are ignored, as `Dialect.patch` ignores them.
 */
export function applyEditsToDocument(
  document: TokenDocument,
  edits: Edits,
): TokenDocument {
  return {
    ...document,
    tokens: document.tokens.map((token) => {
      const edit = edits[token.name];
      if (edit === undefined) return token;
      return { ...token, value: mergeEdit(token.value, edit) };
    }),
  };
}

function mergeEdit(value: TokenValue, edit: Edit): TokenValue {
  if (typeof edit === "string") {
    return value.raw !== undefined
      ? { ...value, raw: edit }
      : { ...value, light: edit };
  }
  return {
    ...value,
    ...(edit.light !== undefined && { light: edit.light }),
    ...(edit.dark !== undefined && { dark: edit.dark }),
  };
}

/**
 * Fit names double as file names in the real adapter's fit store, so
 * both adapters refuse names that could escape it — keeping the fake a
 * faithful stand-in.
 */
export function invalidFitNameMessage(name: string): string | null {
  if (name === "" || name.startsWith(".") || /[/\\]/.test(name)) {
    return `${JSON.stringify(name)} is not a valid fit name: names cannot be empty, start with ".", or contain path separators`;
  }
  return null;
}

export function unknownFitMessage(name: string): string {
  return `no fit named ${JSON.stringify(name)}`;
}
