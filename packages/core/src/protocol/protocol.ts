import type { Edits, TokenDocument } from "../model/types.js";
import type { ProviderInfo } from "../provider/provider.js";
import { isEdits } from "./shared.js";

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
 * - `list-providers` — the detected Providers, CLI-first. An empty list
 *   means the mutation feature is absent, not broken.
 * - `mutate` — ask the named Provider for a Mutation. `baseEdits` is
 *   the active Mutation on a follow-up, so the prompt refines it. The
 *   answer's edits arrive as an unsaved Fit: the client previews them
 *   and commits through the ordinary write gate.
 */
export type ProtocolRequest =
  | { type: "read" }
  | { type: "preview"; edits: Edits }
  | { type: "commit"; edits: Edits }
  | { type: "save-fit"; name: string; edits: Edits }
  | { type: "list-fits" }
  | { type: "apply-fit"; name: string }
  | { type: "delete-fit"; name: string }
  | { type: "list-providers" }
  | { type: "mutate"; providerId: string; prompt: string; baseEdits?: Edits };

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
  | { type: "providers"; providers: ProviderInfo[] }
  | { type: "mutation"; edits: Edits }
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
    case "list-providers":
      return { type: request.type };
    case "mutate":
      if (
        typeof request.providerId !== "string" ||
        typeof request.prompt !== "string" ||
        (request.baseEdits !== undefined && !isEdits(request.baseEdits))
      ) {
        return null;
      }
      return {
        type: request.type,
        providerId: request.providerId,
        prompt: request.prompt,
        ...(request.baseEdits !== undefined && { baseEdits: request.baseEdits }),
      };
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
