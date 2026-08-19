import postcss from "postcss";
import valueParser from "postcss-value-parser";
import type { Token, TokenSet } from "../model/types.js";

/**
 * Parses an emdash tokens.css excerpt: custom properties in `:root`,
 * including `:root` rules nested inside `@layer base` (or any `@layer`).
 * Values written as `light-dark(a, b)` are split into a light/dark pair;
 * any other value is kept as a single raw value.
 */
export function parseEmdash(css: string): TokenSet {
  const root = postcss.parse(css);
  const tokens: Token[] = [];

  root.walkRules(":root", (rule) => {
    rule.walkDecls((decl) => {
      if (!decl.prop.startsWith("--")) return;
      tokens.push({ name: decl.prop, value: parseValue(decl.value) });
    });
  });

  return { tokens, dialect: "emdash" };
}

function parseValue(value: string): { raw?: string; light?: string; dark?: string } {
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
