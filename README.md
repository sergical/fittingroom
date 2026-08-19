# fittingroom

fittingroom is the fitting room for your app's design tokens — try looks on,
keep what fits. Install a Vite plugin, get a live token-editing UI at
`/__fittingroom` inside your own app, tweak your design tokens in the browser,
and write the edits back to your CSS.

It understands the shadcn/Tailwind v4 `@theme`/`:root` dialect and the
emdash `@layer base`/`light-dark()` dialect, parsing both into a
DTCG-shaped token model.

Works with any Vite-based framework (Vite, Astro, TanStack Start,
SvelteKit); Next.js support is planned later.

## Packages

| Package          | Description                                             |
| ---------------- | -------------------------------------------------------- |
| `@fittingroom/core` | Parses CSS design tokens and writes edits back            |
| `@fittingroom/ui`   | The laboratory UI served at `/__fittingroom` (private)             |
| `@fittingroom/vite` | Vite plugin that serves the laboratory UI in dev           |

## Status

Early scaffold. Parsers cover the common cases; the laboratory UI and the
plugin's live-editing wiring are still placeholders.
