# fittingroom

fittingroom is the fitting room for your app's design tokens — try looks on,
keep what fits. Install a Vite plugin, get a live token-editing UI at
`/__fittingroom` inside your own app, tweak your design tokens in the browser,
and write the edits back to your CSS.

It understands the shadcn/Tailwind v4 `@theme`/`:root` dialect and the
emdash `@layer base`/`light-dark()` dialect, parsing both into a
DTCG-shaped token model.

Editing is edit-what-you-see: a color-scheme toggle above the Preview
flips your app into dark mode, and an edit targets the half of a
light/dark pair you are previewing — light and dark are edited
independently through one flow.

Works with any Vite-based framework (Vite, Astro, TanStack Start,
SvelteKit); Next.js support is planned later.

## Usage

### Vite

Add the plugin to `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import fittingroom from "fittingroom";

export default defineConfig({
  plugins: [fittingroom()],
});
```

### Astro

Add the integration to `astro.config.mjs` — no manual Vite configuration
needed:

```js
import { defineConfig } from "astro/config";
import { fittingroomAstro } from "fittingroom/astro";

export default defineConfig({
  integrations: [fittingroomAstro()],
});
```

Both accept the same options: `route` (default `"/__fittingroom"`) and
`cssFile` (the token CSS file, relative to the project root; detected
automatically when omitted). The fitting room exists only in dev — run
your dev server and open `/__fittingroom`. Nothing ships to production
builds.

## Packages

| Package          | Description                                             |
| ---------------- | -------------------------------------------------------- |
| `@fittingroom/core` | Parses CSS design tokens and writes edits back            |
| `@fittingroom/ui`   | The laboratory UI served at `/__fittingroom` (private)             |
| `@fittingroom/vite` | Vite plugin that serves the laboratory UI in dev           |

## Status

Early scaffold. Parsers cover the common cases; the laboratory UI and the
plugin's live-editing wiring are still placeholders.
