# ADR-0001: The parsing seam is keyed by CSS dialect, not host framework

Status: accepted (2026-08-19)

## Context

fittingroom must parse design tokens out of a host app's CSS and patch them
back. Two axes of variation exist: the host framework (Vite, Astro, later
maybe Next) and the token-authoring convention in the CSS (shadcn's
`@theme`/`:root`/`.dark`; emdash's `@layer base` with `light-dark()`).
The parser seam had to be keyed by one of them.

## Decision

Parsers are selected by **dialect** — a property of the CSS file content —
never by the host framework. Dialect detection is content-based (does the
CSS contain `@theme`? `light-dark()`?) and lives inside TokenSource.
Framework variation is handled separately, at the delivery layer (the Vite
plugin and its thin Astro wrapper).

## Rationale

Framework and dialect do not correlate: a shadcn theme runs on Next, Vite,
TanStack Start, or Astro; an Astro site may hold an emdash template, a
shadcn port, or hand-rolled CSS vars. Keying parsers by framework encodes
the false claim that the framework determines the CSS convention, and would
require F×D adapters to cover F frameworks and D conventions. Keying by
dialect needs F delivery adapters + D dialects, composed freely.

Environment-based facts (which dev server called us) belong to the delivery
adapter; content-based facts (what is in the CSS) belong to core.

## Known limit

"Dialect" today means a convention *in CSS files* — the dialect interface
parses CSS text. If tokens ever live in TypeScript (Panda config,
vanilla-extract themes), `parse(css)` is the wrong shape and this seam must
be rethought. Deferred until a second non-CSS token source is real.
