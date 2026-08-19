import { readFileSync, writeFileSync } from "node:fs";
import { createTwoFilesPatch } from "diff";
import postcss, { type Root } from "postcss";
import type { Dialect } from "./dialects/dialect.js";
import { emdash } from "./dialects/emdash.js";
import { shadcn } from "./dialects/shadcn.js";
import type { Edits, TokenDocument } from "./model/types.js";

/**
 * The outcome of `TokenSource.write()`. A write the source cannot make
 * safely is refused with a reason — never applied partially or
 * destructively. When the refused change could be computed (the file
 * parses, but does not re-serialize byte-identically), `diff` carries
 * the unified diff of the change the source declined to make; when no
 * change could even be computed (unknown dialect, unparseable file,
 * invalid edit value), `diff` is empty.
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
   * it cannot parse and re-serialize byte-identically, and never writes
   * an edit value that would serialize as anything but one declaration's
   * value — so a patch is byte-identical everywhere except the edited
   * declarations.
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
      const invalidEdit = invalidEditReason(edits);
      if (invalidEdit) return refused(invalidEdit);

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

/**
 * Rejects any edit value that would serialize as more than one
 * declaration's value — e.g. `blue; } .evil { color: green` — before it
 * can inject new declarations or rules into the file.
 */
function invalidEditReason(edits: Edits): string | null {
  for (const [name, edit] of Object.entries(edits)) {
    const values = typeof edit === "string" ? [edit] : [edit.light, edit.dark];
    for (const value of values) {
      if (value !== undefined && !isDeclarationValue(name, value)) {
        return `edit for ${name} is not a single declaration value: ${JSON.stringify(value)}`;
      }
    }
  }
  return null;
}

function isDeclarationValue(prop: string, value: string): boolean {
  let root: Root;
  try {
    root = postcss.parse(`:root{${prop}:${value}}`);
  } catch {
    return false;
  }
  const rule = root.first;
  return (
    root.nodes.length === 1 &&
    rule?.type === "rule" &&
    rule.nodes.length === 1 &&
    rule.first?.type === "decl" &&
    rule.first.value === value &&
    !rule.first.important
  );
}
