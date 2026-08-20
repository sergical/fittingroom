import type { Edits, TokenDocument } from "../model/types.js";
import { isEdits } from "../protocol/shared.js";

/**
 * A Provider's identity, as the Protocol wire and the picker carry it:
 * everything about the Provider except its ability to run.
 */
export interface ProviderInfo {
  id: string;
  /** Display label, e.g. "Claude CLI". */
  label: string;
  /** Detection is CLI-first: "cli" Providers order before "api" ones. */
  kind: "cli" | "api";
}

/**
 * One mutation request: the natural-language prompt, the TokenDocument
 * it restyles, and — on a follow-up — the active Mutation's edits, so
 * "warmer" refines the proposal rather than restarting it.
 */
export interface MutationRequest {
  prompt: string;
  document: TokenDocument;
  baseEdits?: Edits;
}

/**
 * The Provider seam: a source of Mutations. Adapters wrap installed
 * coding-agent CLIs piped headlessly or an API; every one of them
 * answers a prompt with proposed Edits and nothing else.
 */
export interface Provider extends ProviderInfo {
  mutate(request: MutationRequest): Promise<Edits>;
}

/**
 * The one prompt every adapter sends: the document (and, on a
 * follow-up, the Mutation being refined) as JSON, the instruction, and
 * the exact output contract `parseMutationEdits` expects.
 */
export function buildMutationPrompt(request: MutationRequest): string {
  const lines = [
    "You are restyling an app's design tokens (CSS custom properties).",
    `Current tokens, as JSON:\n${JSON.stringify(request.document.tokens, null, 2)}`,
  ];
  if (request.baseEdits && Object.keys(request.baseEdits).length > 0) {
    lines.push(
      "You already proposed this edit set; the instruction refines it. " +
        `Answer with the full refined edit set, not a delta:\n${JSON.stringify(request.baseEdits, null, 2)}`,
    );
  }
  lines.push(
    `Instruction: ${request.prompt}`,
    "Respond with only one JSON object mapping token names to new values. " +
      '{"--name": "value"} replaces a single value; ' +
      '{"--name": {"light": "...", "dark": "..."}} targets one or both color-scheme halves. ' +
      "Include only the tokens you change. Every value must be valid CSS for that token.",
  );
  return lines.join("\n\n");
}

/**
 * Extracts the Edits object from a Provider's raw text output. CLIs
 * narrate around their answer, so this takes the last balanced
 * top-level `{...}` that parses as Edits instead of trusting the whole
 * stream.
 */
export function parseMutationEdits(text: string): Edits {
  let edits: Edits | null = null;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (char === "}" && depth > 0) {
      depth--;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(start, i + 1));
          if (isEdits(parsed)) edits = parsed;
        } catch {
          // narration that merely looked brace-balanced; keep scanning
        }
      }
    }
  }
  if (!edits) {
    throw new Error("the provider's output contains no JSON edit set");
  }
  return edits;
}
