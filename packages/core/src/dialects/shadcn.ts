import postcss, { type Declaration, type Root } from "postcss";
import type { Edits, Token, TokenDocument } from "../model/types.js";
import type { Dialect } from "./dialect.js";

type Scheme = "light" | "dark";

/**
 * Visits every custom-property declaration in the containers the dialect
 * owns, in document order. `:root` rules and `@theme` blocks hold light
 * values; `.dark` rules hold the matching dark values.
 */
function walkTokenDecls(
  root: Root,
  visit: (decl: Declaration, scheme: Scheme) => void,
): void {
  root.walk((node) => {
    let scheme: Scheme;
    if (node.type === "rule" && node.selector === ":root") scheme = "light";
    else if (node.type === "atrule" && node.name === "theme") scheme = "light";
    else if (node.type === "rule" && node.selector === ".dark") scheme = "dark";
    else return;

    node.walkDecls((decl) => {
      if (decl.prop.startsWith("--")) visit(decl, scheme);
    });
  });
}

/**
 * The shadcn/Tailwind v4 globals.css convention: custom properties in
 * `:root` or `@theme` (light values) paired with matching custom
 * properties in `.dark` (dark values) by name.
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

    walkTokenDecls(root, (decl, scheme) => {
      const target = scheme === "dark" ? darkValues : lightValues;
      if (!target.has(decl.prop)) {
        target.set(decl.prop, decl.value);
      }
      if (scheme === "light" && !order.includes(decl.prop)) {
        order.push(decl.prop);
      }
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

  patch(css, edits) {
    const root = postcss.parse(css);
    const patched: Record<Scheme, Set<string>> = {
      light: new Set(),
      dark: new Set(),
    };

    walkTokenDecls(root, (decl, scheme) => {
      const edit = edits[decl.prop];
      if (edit === undefined || patched[scheme].has(decl.prop)) return;
      const next =
        typeof edit === "string"
          ? scheme === "light"
            ? edit
            : undefined
          : edit[scheme];
      if (next === undefined) return;
      decl.value = next;
      patched[scheme].add(decl.prop);
    });

    return root.toString();
  },
};
