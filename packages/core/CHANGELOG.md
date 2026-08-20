# @fittingroom/core

## 0.2.0

### Minor Changes

- c12bf89: Add a browser-safe entry point at `@fittingroom/core/browser`, exporting the model, the Protocol, and the in-memory fake adapter. The main entry re-exports TokenSource, the filesystem adapter, and Provider detection, all of which import `node:` modules; a bundler asked to put them in a browser build emits stubs that throw while the module evaluates, with no build error to show for it. That is what left the hosted demo rendering a blank page. Browser clients now import the subpath instead, and a test walks the subpath's import graph to keep `node:` out of it.

## 0.1.0

### Minor Changes

- 8ee743b: Add the Protocol connecting clients to the TokenSource: a typed message set (`read`, `preview`, `commit`, and Fit `save`/`list`/`apply`/`delete`) behind one `ProtocolAdapter` interface, with two adapters. `createTokenSourceAdapter({ source, fitsDir })` is the real one — commits inherit round-trip refusal and Fits persist as JSON files in the fits directory. `createFakeAdapter()` holds a sample TokenDocument in memory and simulates writes (with an optional configured refusal), needing no filesystem or server. Refused writes travel through the Protocol with their diff and reason intact.
- bfc0078: Add the Provider seam for AI Mutations. A Provider turns a natural-language
  prompt and the TokenDocument into Edits. `detectProviders` finds what the
  developer's machine already has, CLI-first: the `claude` and `codex` CLIs
  piped headlessly, then OpenRouter as an API fallback when
  `OPENROUTER_API_KEY` is set. Zero hits means the feature is absent, not
  broken. The Protocol gains two messages — `list-providers` and `mutate` —
  so the lab UI stays a pure Protocol client; a follow-up `mutate` carries
  `baseEdits` so the Provider refines the active Mutation instead of
  restarting.
- 9042bb1: Surface refused writes as an actionable diff. A TokenSource refusal now carries a best-effort unified diff of the change it declined to make — computed textually, so it exists even for a file the dialect cannot parse — instead of the internal round-trip discrepancy. In the lab UI a refused commit renders that diff (via @pierre/diffs, lazy-loaded so the renderer stays out of the initial bundle) with the refusal reason and a "Copy patch" action, so applying the change by hand takes seconds. No file is ever mutated by a refused commit.
- b7191a0: Fold the parsers and serializer behind one deep TokenSource module: `createTokenSource(filePath)` with `read()` → TokenDocument and `write(edits)` → applied | refused(diff, reason). Dialect detection (shadcn, emdash) is content-based and internal; writes enforce the round-trip refusal invariant. The standalone `parseShadcn`, `parseEmdash`, and `applyEdits` exports are removed, and `TokenSet` is renamed to `TokenDocument`.

### Patch Changes

- 56f8a07: Route the Workers AI and OpenRouter Providers through Cloudflare AI Gateway. `detectProviders` gains a Workers AI provider (id `workers-ai`), enabled when `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID`, and `CLOUDFLARE_API_TOKEN` are all set (model overridable via `WORKERS_AI_MODEL`). When the same Cloudflare account and gateway are set, OpenRouter is also routed through the gateway instead of hit directly; the detection ladder is now claude, codex, workers-ai, openrouter.
- 8454f3c: Fix the package entry points: `main`, `types`, and `exports` now name the `.mjs` and `.d.mts` files the build actually emits, so importing the published packages resolves.
