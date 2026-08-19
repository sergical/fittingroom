import type { TokenDocument } from "../model/types.js";
import type { Fit, ProtocolAdapter, ProtocolResponse } from "./protocol.js";
import {
  applyEditsToDocument,
  invalidFitNameMessage,
  unknownFitMessage,
} from "./shared.js";

export interface FakeAdapterOptions {
  /** The document the adapter serves. Defaults to a built-in sample. */
  document?: TokenDocument;
  /** When set, every commit is refused with exactly this reason and diff. */
  refusal?: { reason: string; diff: string };
}

// Mirrors a subset of the shadcn-globals.css test fixture, so the fake
// and the real adapter answer `read` identically in conformance tests.
const sampleDocument: TokenDocument = {
  dialect: "shadcn",
  tokens: [
    { name: "--radius", value: { light: "0.625rem" } },
    {
      name: "--background",
      value: { light: "oklch(1 0 0)", dark: "oklch(0.145 0 0)" },
    },
    {
      name: "--foreground",
      value: { light: "oklch(0.145 0 0)", dark: "oklch(0.985 0 0)" },
    },
    {
      name: "--primary",
      value: { light: "oklch(0.205 0 0)", dark: "oklch(0.922 0 0)" },
    },
  ],
};

/**
 * The in-memory Protocol adapter: holds a sample TokenDocument and
 * simulates writes against it. Needs no filesystem or server, so it
 * backs UI tests and the hosted demo.
 */
export function createFakeAdapter(
  options: FakeAdapterOptions = {},
): ProtocolAdapter {
  let document = structuredClone(options.document ?? sampleDocument);
  const fits = new Map<string, Fit>();

  return {
    async handle(request): Promise<ProtocolResponse> {
      switch (request.type) {
        case "read":
          return { type: "document", document };

        case "preview":
          return {
            type: "previewed",
            document: applyEditsToDocument(document, request.edits),
          };

        case "commit":
          if (options.refusal) return { type: "refused", ...options.refusal };
          document = applyEditsToDocument(document, request.edits);
          return { type: "committed" };

        case "save-fit": {
          const invalid = invalidFitNameMessage(request.name);
          if (invalid) return { type: "error", message: invalid };
          const fit: Fit = {
            name: request.name,
            edits: structuredClone(request.edits),
          };
          fits.set(fit.name, fit);
          return { type: "fit-saved", fit };
        }

        case "list-fits":
          return {
            type: "fits",
            fits: [...fits.values()].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          };

        case "apply-fit": {
          const fit = fits.get(request.name);
          if (!fit) {
            return { type: "error", message: unknownFitMessage(request.name) };
          }
          return { type: "fit-applied", fit };
        }

        case "delete-fit":
          if (!fits.delete(request.name)) {
            return { type: "error", message: unknownFitMessage(request.name) };
          }
          return { type: "fit-deleted", name: request.name };
      }
    },
  };
}
