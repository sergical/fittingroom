import { createTwoFilesPatch } from "diff";
import {
  createFakeAdapter,
  type ProtocolAdapter,
  type ProtocolResponse,
} from "@fittingroom/core/browser";
import { demoDocument, sampleCss } from "./sample.js";

const COMMIT_REASON =
  "This hosted demo has no files to write — commits are simulated. " +
  "A real install would apply the patch below to your token CSS.";

/**
 * The hosted demo's Protocol adapter: the in-memory fake over the
 * sample document, with every commit turned into a refusal carrying the
 * patch a real install would have written. The refused-write surface
 * then shows exactly what a commit does, while no server-side write can
 * exist. Everything else — read, preview, Fits — passes through, so the
 * demo behaves like the real lab everywhere a write is not involved.
 */
export function createDemoAdapter(): ProtocolAdapter {
  const inner = createFakeAdapter({ document: demoDocument });
  return {
    async handle(request): Promise<ProtocolResponse> {
      if (request.type !== "commit") return inner.handle(request);
      const previewed = await inner.handle({
        type: "preview",
        edits: request.edits,
      });
      if (previewed.type !== "previewed") return previewed;
      const diff = createTwoFilesPatch(
        "globals.css",
        "globals.css",
        sampleCss(demoDocument),
        sampleCss(previewed.document),
      );
      return { type: "refused", reason: COMMIT_REASON, diff };
    },
  };
}
