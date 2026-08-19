import postcss from "postcss";

/**
 * Applies edits to `:root` custom-property declarations (in any context,
 * including nested inside `@layer`) and returns the resulting CSS. Only
 * the matched declarations' values are touched — everything else,
 * including whitespace and formatting, is preserved byte-for-byte.
 *
 * Deliberately no zero-edit shortcut: `patchRootDecls(css, {})` runs the
 * full parse/re-serialize cycle, which is how TokenSource proves a file
 * round-trips byte-identically before writing to it.
 */
export function patchRootDecls(
  css: string,
  edits: Record<string, string>,
): string {
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
