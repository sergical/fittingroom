import postcss from "postcss";
import valueParser from "postcss-value-parser";
import type { Edit, Token, TokenDocument, TokenValue } from "../model/types.js";
import type { Dialect } from "./dialect.js";

/**
 * The emdash tokens.css convention: custom properties in `:root`,
 * including `:root` rules nested inside `@layer base` (or any `@layer`).
 * Values written as `light-dark(a, b)` are split into a light/dark pair;
 * any other value is kept as a single raw value.
 */
export const emdash: Dialect = {
  name: "emdash",

  detect(css) {
    return css.includes("light-dark(") || /@layer[\s\S]*?:root/.test(css);
  },

  parse(css): TokenDocument {
    const root = postcss.parse(css);
    const tokens: Token[] = [];
    const seen = new Set<string>();

    root.walkRules(":root", (rule) => {
      rule.walkDecls((decl) => {
        if (!decl.prop.startsWith("--") || seen.has(decl.prop)) return;
        seen.add(decl.prop);
        tokens.push({ name: decl.prop, value: parseValue(decl.value) });
      });
    });

    return { tokens, dialect: "emdash" };
  },

  patch(css, edits) {
    const root = postcss.parse(css);
    const patched = new Set<string>();

    root.walkRules(":root", (rule) => {
      rule.walkDecls((decl) => {
        if (!decl.prop.startsWith("--")) return;
        const edit = edits[decl.prop];
        if (edit === undefined || patched.has(decl.prop)) return;
        patched.add(decl.prop);
        decl.value = applyEdit(decl.value, edit);
      });
    });

    return root.toString();
  },
};

/**
 * Merges a scheme-aware edit into the declaration's current value. Only
 * the edited halves change; the other half of a `light-dark()` pair is
 * preserved. A dark edit to a single-valued token promotes it to a
 * `light-dark()` pair.
 */
function applyEdit(value: string, edit: Edit): string {
  if (typeof edit === "string") return edit;
  const current = parseValue(value);
  const light = edit.light ?? current.light ?? current.raw;
  const dark = edit.dark ?? current.dark;
  if (light === undefined || dark === undefined) return light ?? value;
  return `light-dark(${light}, ${dark})`;
}

function parseValue(value: string): TokenValue {
  const parsed = valueParser(value);
  const [first] = parsed.nodes;

  if (first?.type === "function" && first.value === "light-dark") {
    // Split on the function's top-level comma only — argument values may
    // themselves contain commas (e.g. light-dark(rgb(0, 0, 0), #fff)).
    const args: string[] = [""];
    for (const node of first.nodes) {
      if (node.type === "div" && node.value === ",") args.push("");
      else args[args.length - 1] += valueParser.stringify(node);
    }
    const [light, dark] = args.map((arg) => arg.trim());
    return { light, dark };
  }

  return { raw: value };
}
