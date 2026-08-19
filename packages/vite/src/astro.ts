import tokenlab, { type TokenlabOptions } from "./index.js";

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

/** Wraps the TokenLab Vite plugin as an Astro integration. */
export function tokenlabAstro(options?: TokenlabOptions): AstroIntegration {
  return {
    name: "tokenlab",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [tokenlab(options)] } });
      },
    },
  };
}
