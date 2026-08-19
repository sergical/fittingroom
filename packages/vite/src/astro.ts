import fittingroom, { type FittingroomOptions } from "./index.js";

/**
 * Minimal Astro integration shape, defined locally so this package does
 * not depend on `astro`. Matches the subset of `AstroIntegration` that
 * `astro:config:setup` needs.
 */
interface AstroIntegration {
  name: string;
  hooks: {
    "astro:config:setup": (context: { updateConfig: (config: unknown) => void }) => void;
  };
}

/** Wraps the fittingroom Vite plugin as an Astro integration. */
export function fittingroomAstro(options?: FittingroomOptions): AstroIntegration {
  return {
    name: "fittingroom",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [fittingroom(options)] } });
      },
    },
  };
}
