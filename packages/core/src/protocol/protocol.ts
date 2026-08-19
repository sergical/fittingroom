import type { Edits, TokenDocument } from "../model/types.js";

/**
 * A saved, named set of edits: a draft state you can preview, compare,
 * share, and apply.
 */
export interface Fit {
  name: string;
  edits: Edits;
}

/**
 * The Protocol's message set: the small surface connecting clients to
 * the TokenSource. The lab UI and the AI mutator are both Protocol
 * clients; neither is special.
 *
 * - `read` — the current TokenDocument.
 * - `preview` — the document with `edits` merged in, computed without
 *   touching any committed state; the client applies the result to the
 *   running app's DOM.
 * - `commit` — write `edits` back to the source. Answered with
 *   `committed`, or `refused` carrying the round-trip refusal's reason
 *   and diff intact.
 * - `save-fit` / `list-fits` / `apply-fit` / `delete-fit` — Fit
 *   lifecycle. `apply-fit` returns the named Fit; the client previews
 *   its edits.
 */
export type ProtocolRequest =
  | { type: "read" }
  | { type: "preview"; edits: Edits }
  | { type: "commit"; edits: Edits }
  | { type: "save-fit"; name: string; edits: Edits }
  | { type: "list-fits" }
  | { type: "apply-fit"; name: string }
  | { type: "delete-fit"; name: string };

/**
 * One response per request, plus `error` for a request that names an
 * unknown Fit or an invalid Fit name. `document` is null when the
 * source is in no known dialect.
 */
export type ProtocolResponse =
  | { type: "document"; document: TokenDocument | null }
  | { type: "previewed"; document: TokenDocument }
  | { type: "committed" }
  | { type: "refused"; reason: string; diff: string }
  | { type: "fit-saved"; fit: Fit }
  | { type: "fits"; fits: Fit[] }
  | { type: "fit-applied"; fit: Fit }
  | { type: "fit-deleted"; name: string }
  | { type: "error"; message: string };

/**
 * One end of the Protocol. Async so an adapter can sit behind any
 * transport (in-process, HTTP, postMessage) without changing clients.
 */
export interface ProtocolAdapter {
  handle(request: ProtocolRequest): Promise<ProtocolResponse>;
}

/**
 * Narrows an untrusted decoded value (e.g. a parsed HTTP body) to a
 * ProtocolRequest, or null when it is not one. Transports use this to
 * reject malformed requests before they reach an adapter, whose
 * `handle` assumes a well-formed request.
 */
export function parseProtocolRequest(value: unknown): ProtocolRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const request = value as Record<string, unknown>;
  switch (request.type) {
    case "read":
    case "list-fits":
      return { type: request.type };
    case "preview":
    case "commit":
      if (!isEdits(request.edits)) return null;
      return { type: request.type, edits: request.edits };
    case "save-fit":
      if (typeof request.name !== "string" || !isEdits(request.edits)) return null;
      return { type: request.type, name: request.name, edits: request.edits };
    case "apply-fit":
    case "delete-fit":
      if (typeof request.name !== "string") return null;
      return { type: request.type, name: request.name };
    default:
      return null;
  }
}

function isEdits(value: unknown): value is Edits {
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
