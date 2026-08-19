import postcss from "postcss";

/**
 * Applies edits to `:root` custom-property declarations (in any context,
 * including nested inside `@layer`) and returns the resulting CSS. Only
 * the matched declarations' values are touched — everything else,
 * including whitespace and formatting, is preserved byte-for-byte.
 */
export function applyEdits(css: string, edits: Record<string, string>): string {
  if (Object.keys(edits).length === 0) return css;

  const root = postcss.parse(css);

  root.walkRules(":root", (rule) => {
    rule.walkDecls((decl) => {
      if (!decl.prop.startsWith("--")) return;
      if (decl.prop in edits) {
        decl.value = edits[decl.prop]!;
      }
    });
  });

  return root.toString();
}
