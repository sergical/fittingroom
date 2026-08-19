# TokenLab

TokenLab is a design-token laboratory. Install a Vite plugin, get a live
token-editing UI at `/__lab` inside your own app, tweak your design tokens
in the browser, and write the edits back to your CSS.

It understands the shadcn/Tailwind v4 `@theme`/`:root` dialect and the
emdash `@layer base`/`light-dark()` dialect, parsing both into a
DTCG-shaped token model.

Works with any Vite-based framework (Vite, Astro, TanStack Start,
SvelteKit); Next.js support is planned later.

## Packages

| Package          | Description                                             |
| ---------------- | -------------------------------------------------------- |
| `@tokenlab/core` | Parses CSS design tokens and writes edits back            |
| `@tokenlab/ui`   | The laboratory UI served at `/__lab` (private)             |
| `@tokenlab/vite` | Vite plugin that serves the laboratory UI in dev           |

## Status

Early scaffold. Parsers cover the common cases; the laboratory UI and the
plugin's live-editing wiring are still placeholders.
