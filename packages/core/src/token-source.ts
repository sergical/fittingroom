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
 * destructively. When the refusal is about the file (unknown dialect,
 * unparseable, no byte-identical round-trip), `diff` carries a
 * best-effort unified diff of the change the source declined to make —
 * computed textually, so it exists even for a file that cannot be
 * parsed — letting the caller apply the change by hand. `diff` is empty
 * when no edited token appears in the file, and for an invalid edit
 * value (there is no change worth applying).
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
      const declined = () => declinedChangeDiff(filePath, css, edits);
      const dialect = detectDialect(css);
      if (!dialect) {
        return refused(
          `${filePath} is in no known dialect (supported: ${dialects
            .map((d) => d.name)
            .join(", ")})`,
          declined(),
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
          declined(),
        );
      }
      if (roundTripped !== css) {
        return refused(
          `${filePath} does not re-serialize byte-identically, so patching it could corrupt it`,
          declined(),
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
 * Best-effort unified diff of the change the source declined to make,
 * so a refused write still hands the caller a patch to apply by hand.
 * Substitutes declaration values textually — no dialect parse, so it
 * works on the very files that get refused. A token's occurrences map
 * to scheme halves in order: the first takes the light half (or a bare
 * string), the second the dark half — how both dialects lay pairs out.
 * Display-only; never written back.
 */
function declinedChangeDiff(
  filePath: string,
  css: string,
  edits: Edits,
): string {
  let intended = css;
  for (const [name, edit] of Object.entries(edits)) {
    const halves =
      typeof edit === "string" ? [edit] : [edit.light, edit.dark];
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let occurrence = 0;
    intended = intended.replace(
      new RegExp(`(${escapedName}\\s*:\\s*)([^;}\\n]+)`, "g"),
      (match, before: string) => {
        const half = halves[occurrence];
        occurrence += 1;
        return half === undefined ? match : before + half;
      },
    );
  }
  if (intended === css) return "";
  return createTwoFilesPatch(filePath, filePath, css, intended);
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
