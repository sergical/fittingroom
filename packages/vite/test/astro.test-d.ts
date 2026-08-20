import type { AstroIntegration } from "astro";
import { fittingroomAstro } from "../src/astro.js";

/**
 * Compile-time only, checked by `tsc -p tsconfig.typecheck.json` in the
 * test script. The integration's locally defined type must stay
 * assignable to Astro's published `AstroIntegration`, or TypeScript
 * Astro projects cannot register it in `astro.config.ts` without a
 * type error.
 */
const integration: AstroIntegration = fittingroomAstro();
void integration;
