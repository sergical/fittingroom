---
"fittingroom": minor
---

Astro integration: `fittingroomAstro()` from `fittingroom/astro` wires the Vite plugin through Astro's `astro:config:setup` hook — no manual Vite configuration needed. The integration injects the preview client into every Astro page (Astro pages never pass through Vite's `transformIndexHtml`), and configures nothing outside `astro dev`, so no trace of fittingroom reaches a build. Verified against a real Astro dev server: the lab loads, tokens are read, and edits commit back to the source CSS.
