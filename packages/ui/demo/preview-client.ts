/**
 * The preview client for the demo's sample page. Mirrors the client the
 * Vite plugin injects into host pages (packages/vite/src/index.ts):
 * same `fittingroom:preview` message shape, same two-rule stylesheet —
 * `:root:not(.dark)` for light overrides, `:root.dark` for dark ones,
 * each pinning its own `color-scheme` — and the same restriction that
 * font audition links load from fonts.googleapis.com only.
 */

interface PreviewRule {
  rule: CSSStyleRule;
  applied: Set<string>;
}

export function installPreviewClient(): void {
  let rules: { light: PreviewRule; dark: PreviewRule } | null = null;
  const fontLinks = new Map<string, HTMLLinkElement>();

  const applyFonts = (fonts: unknown) => {
    const wanted = (Array.isArray(fonts) ? fonts : []).filter(
      (url): url is string =>
        typeof url === "string" &&
        url.startsWith("https://fonts.googleapis.com/"),
    );
    for (const [url, link] of [...fontLinks]) {
      if (!wanted.includes(url)) {
        link.remove();
        fontLinks.delete(url);
      }
    }
    for (const url of wanted) {
      if (!fontLinks.has(url)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url;
        document.head.append(link);
        fontLinks.set(url, link);
      }
    }
  };

  const previewRules = () => {
    if (rules) return rules;
    const sheet = document.createElement("style");
    sheet.id = "fittingroom-preview";
    document.head.append(sheet);
    const insert = (
      selector: string,
      scheme: string,
      index: number,
    ): PreviewRule => {
      sheet.sheet!.insertRule(`${selector} { color-scheme: ${scheme} }`, index);
      return {
        rule: sheet.sheet!.cssRules[index] as CSSStyleRule,
        applied: new Set(),
      };
    };
    return (rules = {
      light: insert(":root:not(.dark)", "light", 0),
      dark: insert(":root.dark", "dark", 1),
    });
  };

  const applyEdits = ({ rule, applied }: PreviewRule, edits: object) => {
    for (const name of [...applied]) {
      if (!(name in edits)) {
        rule.style.removeProperty(name);
        applied.delete(name);
      }
    }
    for (const [name, value] of Object.entries(edits)) {
      if (name.startsWith("--") && typeof value === "string") {
        rule.style.setProperty(name, value);
        applied.add(name);
      }
    }
  };

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (
      !data ||
      data.type !== "fittingroom:preview" ||
      typeof data.edits !== "object" ||
      data.edits === null
    ) {
      return;
    }
    applyFonts(data.fonts);
    const { light, dark } = previewRules();
    applyEdits(light, data.edits);
    applyEdits(
      dark,
      typeof data.darkEdits === "object" && data.darkEdits !== null
        ? data.darkEdits
        : {},
    );
    if (data.scheme === "light" || data.scheme === "dark") {
      document.documentElement.classList.toggle("dark", data.scheme === "dark");
    }
  });
}
