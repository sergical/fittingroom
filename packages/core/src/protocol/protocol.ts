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
