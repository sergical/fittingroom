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

## Demo

Try the fitting room without installing anything:
[fittingroom.serg.tech](https://fittingroom.serg.tech).
The demo runs the lab UI on the in-memory fake adapter with a sample
token set — edits preview live against a sample page, and Commit shows
the patch a real install would have written to your CSS. Nothing is
written anywhere.

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

## AI mutations

The lab can turn a written instruction into a Fit. It picks a provider with
this ladder, and the lab's dropdown lets you override the choice (the
selection persists in `localStorage`):

1. `claude` CLI, if it is on `PATH`
2. `codex` CLI, if it is on `PATH`
3. Workers AI
4. OpenRouter

The two CLI providers need no configuration. The two API providers read
these environment variables from the shell that runs your dev server:

| Variable | Used for |
| -------- | -------- |
| `CLOUDFLARE_ACCOUNT_ID` | Workers AI, and the AI Gateway route |
| `CLOUDFLARE_AI_GATEWAY_ID` | Workers AI, and the AI Gateway route |
| `CLOUDFLARE_API_TOKEN` | Workers AI |
| `OPENROUTER_API_KEY` | OpenRouter |
| `WORKERS_AI_MODEL` | Workers AI model override (default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| `OPENROUTER_MODEL` | OpenRouter model override (default `anthropic/claude-sonnet-4.5`) |

Workers AI appears only when all three `CLOUDFLARE_*` variables are set; it
always goes through AI Gateway. OpenRouter appears whenever its key is set,
and it also goes through the gateway when the account and gateway IDs are
present. No hits means the mutation feature is absent, not broken.

## Packages

| Package          | Description                                             |
| ---------------- | -------------------------------------------------------- |
| `@fittingroom/core` | Parses CSS design tokens and writes edits back            |
| `@fittingroom/ui`   | The laboratory UI served at `/__fittingroom` (private)             |
| `fittingroom`       | Vite plugin and Astro integration that serve the laboratory UI in dev |

## Status

v1 is complete: the parsers, the laboratory UI, Fits, Compare, the AI
mutation flow, and the Vite plugin and Astro integration all ship. See the
[GitHub releases](https://github.com/sergical/fittingroom/releases) for what
changed in each version.
