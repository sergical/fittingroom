import postcss from "postcss";
import type { Token, TokenSet } from "../model/types.js";

/**
 * Parses a shadcn/Tailwind v4 globals.css excerpt: custom properties in
 * `:root` (light values) paired with matching custom properties in
 * `.dark` (dark values) by name.
 *
 * TODO: also read tokens declared inside `@theme` blocks — Tailwind v4
 * projects sometimes define tokens there instead of (or in addition to)
 * `:root`.
 */
export function parseShadcn(css: string): TokenSet {
  const root = postcss.parse(css);
  const lightValues = new Map<string, string>();
  const darkValues = new Map<string, string>();
  const order: string[] = [];

  root.walkRules((rule) => {
    const isRoot = rule.selector === ":root";
    const isDark = rule.selector === ".dark";
    if (!isRoot && !isDark) return;

    rule.walkDecls((decl) => {
      if (!decl.prop.startsWith("--")) return;
      const target = isDark ? darkValues : lightValues;
      if (!target.has(decl.prop)) {
        target.set(decl.prop, decl.value);
      }
      if (isRoot && !order.includes(decl.prop)) {
        order.push(decl.prop);
      }
    });
  });

  const tokens: Token[] = order.map((name) => ({
    name,
    value: {
      light: lightValues.get(name),
      dark: darkValues.get(name),
    },
  }));

  return { tokens, dialect: "shadcn" };
}
