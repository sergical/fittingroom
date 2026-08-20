# fittingroom — domain glossary

fittingroom is the fitting room for an app's design tokens: a Vite plugin
that serves a live token-editing UI inside the host app, and writes accepted
edits back to the app's CSS.

## Terms

**Token** — one CSS custom property that participates in the app's design
system (a color, font, spacing, radius, or shadow value). Identified by its
custom-property name (e.g. `--primary`). A token's value may be a single raw
value or a light/dark pair.

**TokenDocument** — the complete, DTCG-shaped set of tokens read from a host
app, tagged with the dialect it was read in. The unit that clients read and
that edits are expressed against.

**Dialect** — a token-authoring convention in CSS: how tokens are written,
paired with dark mode, and where they live. v1 dialects: `shadcn`
(`@theme` / `:root` / `.dark`) and `emdash` (`@layer base { :root }` with
`light-dark()`). A dialect is a property of the CSS content, never of the
host framework (see ADR-0001).

**TokenSource** — the deep module that owns reading and writing a host app's
tokens. Interface: `read()` and `write(edits)`. Dialect detection, parsing,
and file patching are implementation, not interface.

**Edit** — a proposed change to one token's value: a raw replacement string,
or a `{ light?, dark? }` pair that targets one color scheme without touching
the other. Each dialect maps the schemes onto its own convention. Edits are
previewed in the running app before they are committed to files.

**Round-trip refusal** — the write invariant: TokenSource never writes to a
file it cannot parse and re-serialize byte-identically. A write it cannot
make safely is refused and returned to the caller as a diff.

**Protocol** — the small message set connecting clients to the TokenSource
(read, patch-preview, commit, and draft-state management). Both the lab UI
and the AI mutation agent are protocol clients; neither is special.

**Preview** — applying edits to the running host app's DOM (CSS variable
overrides) without touching files. Losing a preview is always harmless.

**Fit** — a saved, named set of edits: a draft state you can preview, compare,
share, and apply. Fits live in `.fittingroom/` and are committed to version
control by default. (The word "changeset" is reserved for the
`@changesets/cli` release tooling and never refers to Fits.)

**Refused write** — the outcome of a write that would violate round-trip
refusal. Surfaced to the user as a diff with the reason; never silent.

**Mutation** — a set of edits proposed by an AI provider from a natural-
language prompt. A mutation arrives as an unsaved Fit applied to the
preview; committing it goes through the same write path as manual edits.

**Provider** — a source of mutations: an API (e.g. Workers AI or
OpenRouter, both reachable through Cloudflare AI Gateway) or an installed
coding-agent CLI piped headlessly (e.g. claude, codex). Providers are
detected on the developer's machine and sit behind one seam; the mutation
feature degrades to absent when no provider is found.

**Compare** — viewing two Fits side by side in dual previews.
