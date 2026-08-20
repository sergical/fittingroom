import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Provider } from "../provider/provider.js";
import type { TokenSource } from "../token-source.js";
import type { Fit, ProtocolAdapter, ProtocolResponse } from "./protocol.js";
import {
  applyEditsToDocument,
  invalidFitNameMessage,
  mutateWithProvider,
  providerInfo,
  unknownFitMessage,
} from "./shared.js";

export interface TokenSourceAdapterOptions {
  source: TokenSource;
  /** Where Fits are stored, e.g. `<app root>/.fittingroom`. */
  fitsDir: string;
  /** The detected Providers, CLI-first. Defaults to none. */
  providers?: Provider[];
}

/**
 * The real Protocol adapter: reads and commits through a TokenSource
 * (inheriting its round-trip refusal), and stores each Fit as
 * `<fitsDir>/<name>.json` so Fits travel with the host repo.
 */
export function createTokenSourceAdapter(
  options: TokenSourceAdapterOptions,
): ProtocolAdapter {
  const { source, fitsDir, providers = [] } = options;
  const fitPath = (name: string) => join(fitsDir, `${name}.json`);

  return {
    async handle(request): Promise<ProtocolResponse> {
      switch (request.type) {
        case "read":
          return { type: "document", document: source.read() };

        case "preview": {
          const document = source.read();
          if (!document) {
            return {
              type: "error",
              message: "the source has no readable TokenDocument to preview against",
            };
          }
          return {
            type: "previewed",
            document: applyEditsToDocument(document, request.edits),
          };
        }

        case "commit": {
          const result = source.write(request.edits);
          if (result.status === "refused") {
            return { type: "refused", reason: result.reason, diff: result.diff };
          }
          return { type: "committed" };
        }

        case "save-fit": {
          const invalid = invalidFitNameMessage(request.name);
          if (invalid) return { type: "error", message: invalid };
          const fit: Fit = { name: request.name, edits: request.edits };
          mkdirSync(fitsDir, { recursive: true });
          writeFileSync(fitPath(fit.name), `${JSON.stringify(fit, null, 2)}\n`);
          return { type: "fit-saved", fit };
        }

        case "list-fits": {
          if (!existsSync(fitsDir)) return { type: "fits", fits: [] };
          const fits = readdirSync(fitsDir)
            .filter((entry) => entry.endsWith(".json"))
            .sort()
            .map(
              (entry) =>
                JSON.parse(readFileSync(join(fitsDir, entry), "utf8")) as Fit,
            );
          return { type: "fits", fits };
        }

        case "apply-fit": {
          const invalid = invalidFitNameMessage(request.name);
          if (invalid) return { type: "error", message: invalid };
          if (!existsSync(fitPath(request.name))) {
            return { type: "error", message: unknownFitMessage(request.name) };
          }
          const fit = JSON.parse(
            readFileSync(fitPath(request.name), "utf8"),
          ) as Fit;
          return { type: "fit-applied", fit };
        }

        case "delete-fit": {
          const invalid = invalidFitNameMessage(request.name);
          if (invalid) return { type: "error", message: invalid };
          if (!existsSync(fitPath(request.name))) {
            return { type: "error", message: unknownFitMessage(request.name) };
          }
          rmSync(fitPath(request.name));
          return { type: "fit-deleted", name: request.name };
        }

        case "list-providers":
          return { type: "providers", providers: providers.map(providerInfo) };

        case "mutate":
          return mutateWithProvider(providers, source.read(), request);
      }
    },
  };
}
