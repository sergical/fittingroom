import postcss from "postcss";
import type { Token, TokenDocument } from "../model/types.js";
import type { Dialect } from "./dialect.js";
import { patchRootDecls } from "./patch.js";

/**
 * The shadcn/Tailwind v4 globals.css convention: custom properties in
 * `:root` (light values) paired with matching custom properties in
 * `.dark` (dark values) by name.
 *
 * TODO: also read tokens declared inside `@theme` blocks — Tailwind v4
 * projects sometimes define tokens there instead of (or in addition to)
 * `:root`.
 */
export const shadcn: Dialect = {
  name: "shadcn",

  detect(css) {
    return /\.dark\s*\{/.test(css) || css.includes("@theme");
  },

  parse(css): TokenDocument {
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
  },

  patch: patchRootDecls,
};
