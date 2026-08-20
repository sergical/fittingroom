import fittingroom, { type FittingroomOptions } from "./index.js";

/**
 * Minimal Astro integration shape, defined locally so this package does
 * not depend on `astro`. Matches the subset of `AstroIntegration` that
 * `astro:config:setup` needs.
 */
interface AstroIntegration {
  name: string;
  hooks: {
    "astro:config:setup": (context: {
      command: "dev" | "build" | "preview";
      updateConfig: (config: unknown) => void;
      injectScript: (stage: "head-inline", content: string) => void;
    }) => void;
  };
}

/**
 * Wraps the fittingroom Vite plugin as an Astro integration. Dev-only by
 * construction: outside `astro dev` the hook configures nothing, so no
 * trace of fittingroom reaches a build.
 */
export function fittingroomAstro(options?: FittingroomOptions): AstroIntegration {
  const route = options?.route ?? "/__fittingroom";
  return {
    name: "fittingroom",
    hooks: {
      "astro:config:setup": ({ command, updateConfig, injectScript }) => {
        if (command !== "dev") return;
        updateConfig({ vite: { plugins: [fittingroom(options)] } });
        // Astro pages never pass through Vite's transformIndexHtml, so
        // the preview client the plugin would inject there is injected
        // into every page here instead.
        injectScript("head-inline", `import("${route}/preview-client.js");`);
      },
    },
  };
}
