import { readFileSync, writeFileSync } from "node:fs";
import { createTwoFilesPatch } from "diff";
import type { Dialect } from "./dialects/dialect.js";
import { emdash } from "./dialects/emdash.js";
import { shadcn } from "./dialects/shadcn.js";
import type { TokenDocument } from "./model/types.js";

/** A proposed change to one token's value, keyed by custom-property name. */
export type Edits = Record<string, string>;

/**
 * The outcome of `TokenSource.write()`. A write the source cannot make
 * safely is refused with a reason and a unified diff of the change it
 * declined to make — never applied partially or destructively.
 */
export type WriteResult =
  | { status: "applied" }
  | { status: "refused"; reason: string; diff: string };

/**
 * The deep module that owns reading and writing a host app's tokens.
 * Dialect detection, parsing, and file patching are implementation,
 * not interface.
 */
export interface TokenSource {
  /**
   * Reads the source into a TokenDocument tagged with its dialect, or
   * null when the file is in no known dialect or cannot be parsed.
   */
  read(): TokenDocument | null;
  /**
   * Patches declaration values in place and writes the file back.
   * Enforces the round-trip refusal invariant: never writes to a file
   * it cannot parse and re-serialize byte-identically.
   */
  write(edits: Edits): WriteResult;
}

// Detection order matters only when a file matches several dialects;
// shadcn is checked first because it is the more constrained convention.
const dialects: Dialect[] = [shadcn, emdash];

function detectDialect(css: string): Dialect | null {
  return dialects.find((dialect) => dialect.detect(css)) ?? null;
}

/** Creates a TokenSource over one CSS file on disk. */
export function createTokenSource(filePath: string): TokenSource {
  return {
    read() {
      const css = readFileSync(filePath, "utf8");
      const dialect = detectDialect(css);
      if (!dialect) return null;
      try {
        return dialect.parse(css);
      } catch {
        return null;
      }
    },

    write(edits) {
      const css = readFileSync(filePath, "utf8");
      const dialect = detectDialect(css);
      if (!dialect) {
        return refused(
          `${filePath} is in no known dialect (supported: ${dialects
            .map((d) => d.name)
            .join(", ")})`,
        );
      }

      // Round-trip proof: a zero-edit patch must reproduce the file
      // byte-for-byte, or any real patch could corrupt it.
      let roundTripped: string;
      try {
        roundTripped = dialect.patch(css, {});
      } catch (error) {
        return refused(
          `${filePath} cannot be parsed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (roundTripped !== css) {
        return refused(
          `${filePath} does not re-serialize byte-identically, so patching it could corrupt it`,
          createTwoFilesPatch(filePath, filePath, css, roundTripped),
        );
      }

      writeFileSync(filePath, dialect.patch(css, edits));
      return { status: "applied" };
    },
  };
}

function refused(reason: string, diff = ""): WriteResult {
  return { status: "refused", reason, diff };
}
