import { readFileSync, writeFileSync } from "node:fs";
import { createTwoFilesPatch } from "diff";
import postcss, { type Root } from "postcss";
import type { Dialect } from "./dialects/dialect.js";
import { applyEmdashEdit, emdash } from "./dialects/emdash.js";
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
 * works on the very files that get refused — but mirrors the dialects'
 * semantics: an occurrence's scheme comes from its enclosing selector
 * (`.dark` is dark; everything else is light), a `light-dark()` value
 * merges edited halves the way emdash would, and occurrences inside
 * comments or strings are ignored. Display-only; never written back.
 */
function declinedChangeDiff(
  filePath: string,
  css: string,
  edits: Edits,
): string {
  const isLive = liveRangeChecker(css);
  const replacements: { start: number; end: number; text: string }[] = [];

  for (const [name, edit] of Object.entries(edits)) {
    const occurrences = findDeclarations(css, name).filter((occ) =>
      isLive(occ.start),
    );
    const hasDarkScheme = occurrences.some((occ) => occ.scheme === "dark");
    // Like both dialects' patch(), only the first occurrence per scheme
    // is edited.
    const edited = new Set<Scheme>();
    for (const occ of occurrences) {
      if (edited.has(occ.scheme)) continue;
      edited.add(occ.scheme);
      const next = intendedValue(occ, edit, hasDarkScheme);
      if (next !== undefined && next !== occ.value) {
        replacements.push({ start: occ.start, end: occ.end, text: next });
      }
    }
  }

  if (replacements.length === 0) return "";
  // Splice all replacements against the original text in one pass, so
  // one edit's inserted value can never be re-matched by another edit.
  replacements.sort((a, b) => a.start - b.start);
  let intended = "";
  let cursor = 0;
  for (const { start, end, text } of replacements) {
    intended += css.slice(cursor, start) + text;
    cursor = end;
  }
  intended += css.slice(cursor);
  if (intended === css) return "";
  return createTwoFilesPatch(filePath, filePath, css, intended);
}

type Scheme = "light" | "dark";

interface DeclarationOccurrence {
  /** Bounds of the declaration's value within the file. */
  start: number;
  end: number;
  value: string;
  scheme: Scheme;
}

/**
 * The value the declaration would have carried had the write applied:
 * a `light-dark()` pair (or a light-scheme value in a file with no dark
 * counterpart) merges halves the way emdash's writer does; otherwise
 * the shadcn rule applies — a bare string is the light value, an object
 * edit contributes only the half matching the occurrence's scheme.
 */
function intendedValue(
  occ: DeclarationOccurrence,
  edit: Edits[string],
  hasDarkScheme: boolean,
): string | undefined {
  const isPair = occ.value.trimStart().startsWith("light-dark(");
  if (isPair || (!hasDarkScheme && occ.scheme === "light")) {
    return applyEmdashEdit(occ.value, edit);
  }
  if (typeof edit === "string") {
    return occ.scheme === "light" ? edit : undefined;
  }
  return edit[occ.scheme];
}

/**
 * Every `name: value` declaration in the text, with the scheme implied
 * by its nearest enclosing selector. The lookbehind keeps a property
 * like `--brand--primary` from matching a query for `--primary`.
 */
function findDeclarations(css: string, name: string): DeclarationOccurrence[] {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?<![\\w-])${escapedName}\\s*:\\s*([^;}\\n]+)`,
    "g",
  );
  const occurrences: DeclarationOccurrence[] = [];
  for (const match of css.matchAll(pattern)) {
    const value = match[1].trimEnd();
    const start = match.index + match[0].length - match[1].length;
    occurrences.push({
      start,
      end: start + value.length,
      value,
      scheme: enclosingScheme(css, match.index),
    });
  }
  return occurrences;
}

/**
 * The scheme of the block enclosing `index`, judged by its selector the
 * way shadcn's writer does: `.dark` rules hold dark values; `:root`,
 * `@theme`, and anything else hold light values.
 */
function enclosingScheme(css: string, index: number): Scheme {
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const char = css[i];
    if (char === "}") depth += 1;
    else if (char === "{") {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      const selectorStart =
        Math.max(
          css.lastIndexOf(";", i - 1),
          css.lastIndexOf("{", i - 1),
          css.lastIndexOf("}", i - 1),
        ) + 1;
      const selector = css.slice(selectorStart, i).trim();
      return /(^|[\s,])\.dark(?![\w-])/.test(selector) ? "dark" : "light";
    }
  }
  return "light";
}

/**
 * Returns a predicate that reports whether an offset sits outside every
 * CSS comment and string literal, so commented-out or quoted text never
 * consumes an edit meant for a live declaration.
 */
function liveRangeChecker(css: string): (index: number) => boolean {
  const deadRanges: [number, number][] = [];
  let i = 0;
  while (i < css.length) {
    if (css.startsWith("/*", i)) {
      const close = css.indexOf("*/", i + 2);
      const end = close === -1 ? css.length : close + 2;
      deadRanges.push([i, end]);
      i = end;
    } else if (css[i] === '"' || css[i] === "'") {
      const quote = css[i];
      let j = i + 1;
      while (j < css.length && css[j] !== quote) {
        if (css[j] === "\\") j += 1;
        j += 1;
      }
      const end = Math.min(j + 1, css.length);
      deadRanges.push([i, end]);
      i = end;
    } else {
      i += 1;
    }
  }
  return (index) =>
    !deadRanges.some(([start, end]) => index >= start && index < end);
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
