import type { Edit, Edits, TokenDocument, TokenValue } from "../model/types.js";
import type { Provider, ProviderInfo } from "../provider/provider.js";
import type { ProtocolResponse } from "./protocol.js";

/** A Provider stripped for the wire: identity only, never the ability to run. */
export function providerInfo({ id, label, kind }: Provider): ProviderInfo {
  return { id, label, kind };
}

/** Narrows an untrusted decoded value to an Edits record. */
export function isEdits(value: unknown): value is Edits {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (edit) =>
      typeof edit === "string" ||
      (typeof edit === "object" &&
        edit !== null &&
        !Array.isArray(edit) &&
        halfIsAbsentOrString(edit, "light") &&
        halfIsAbsentOrString(edit, "dark")),
  );
}

function halfIsAbsentOrString(edit: object, half: "light" | "dark"): boolean {
  const value = (edit as Record<string, unknown>)[half];
  return value === undefined || typeof value === "string";
}

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

/**
 * Runs one mutation the same way in both adapters: resolve the named
 * Provider, hand it the prompt with the document (and, on a follow-up,
 * the Mutation being refined), and return its Edits — dropping edits to
 * tokens the document does not hold, so a hallucinated name never
 * becomes a ghost draft. A Provider failure travels back as a Protocol
 * error, never a thrown exception.
 */
export async function mutateWithProvider(
  providers: Provider[],
  document: TokenDocument | null,
  request: { providerId: string; prompt: string; baseEdits?: Edits },
): Promise<ProtocolResponse> {
  const provider = providers.find((p) => p.id === request.providerId);
  if (!provider) {
    return {
      type: "error",
      message: `no provider named ${JSON.stringify(request.providerId)}`,
    };
  }
  if (!document) {
    return {
      type: "error",
      message: "the source has no readable TokenDocument to mutate",
    };
  }
  let edits: Edits;
  try {
    edits = await provider.mutate({
      prompt: request.prompt,
      document,
      ...(request.baseEdits !== undefined && { baseEdits: request.baseEdits }),
    });
  } catch (cause) {
    return {
      type: "error",
      message: `${provider.label} failed to mutate: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
  const known = new Set(document.tokens.map((token) => token.name));
  return {
    type: "mutation",
    edits: Object.fromEntries(
      Object.entries(edits).filter(([name]) => known.has(name)),
    ),
  };
}
