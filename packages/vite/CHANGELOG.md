# fittingroom

## 0.1.0

### Minor Changes

- 0defb5f: Astro integration: `fittingroomAstro()` from `fittingroom/astro` wires the Vite plugin through Astro's `astro:config:setup` hook — no manual Vite configuration needed. The integration injects the preview client into every Astro page (Astro pages never pass through Vite's `transformIndexHtml`), and configures nothing outside `astro dev`, so no trace of fittingroom reaches a build. Verified against a real Astro dev server: the lab loads, tokens are read, and edits commit back to the source CSS.
- 8454f3c: Serve the real laboratory UI and complete the color edit loop. The plugin now serves the built lab UI at the dev-only route (default `/__fittingroom`), answers Protocol requests over HTTP at `<route>/api` against the app's own token CSS (auto-detected by content in the root and `src/`, or set via the new `cssFile` option), and injects a preview client into the host app's pages so the lab's iframe Preview applies edits live as CSS-variable overrides — no file writes until commit. Commits go through the TokenSource write path (round-trip refusal included) and produce minimal value-only diffs. The endpoint exists only in dev serve mode and refuses cross-origin requests. Unsaved edits survive a reload of the lab UI.
- 191a7a0: Compare two Fits side by side: picking two sides in the Fits list — two saved Fits, or a saved Fit against the unsaved draft — swaps the single Preview for dual side-by-side Previews, each with its side's edits applied. No flip/toggle mode: both candidates stay on screen at once. Compare never touches the draft state, so leaving it (Exit compare, unselecting a side, or deleting a compared Fit) restores the prior editing state exactly.
- 4a1eeae: Dark-mode editing, edit what you see: a color-scheme toggle above the Preview flips the host app into dark mode (setting the `.dark` class and pinning `color-scheme`, so both shadcn class-based pairs and emdash `light-dark()` values follow). The editors show the previewed scheme's half of each light/dark pair, and an edit targets only that half — light and dark are edited independently through one flow and commit as ordinary scheme-targeted edits. The preview client now keeps one override rule per scheme, so a light-half preview never leaks into dark mode or vice versa.
- 6ffcf92: Give candidate looks an identity: the lab UI now saves the current edit set as a named Fit, lists saved Fits, applies one back onto the Preview, and deletes one — all through the Protocol's existing Fit messages. Fits are stored as pretty-printed JSON under `.fittingroom/` in the host repo, human-readable and git-diff-friendly, so looks travel with the branch. Applying a Fit replaces the draft set — the Preview updates instantly — and committing an applied Fit goes through the ordinary write path, round-trip refusal included.
- 9f122b7: Add the font editor with Google Fonts audition: font tokens get a picker over a curated Google Fonts list, and the Preview loads the candidate stylesheet inside the iframe so the font auditions in place. Commit writes only the variable's value — fittingroom never guesses how the app loads fonts — and hands over the required `@import` snippet with a copy action. Hand-typed families still work through the text input, and an app with no font tokens shows no font section.
- bfc0078: The dev server detects AI Mutation Providers at boot and serves them over
  the Protocol. In the lab, a prompt produces a Mutation that arrives as an
  unsaved Fit applied to the Preview; committing it uses the ordinary write
  path and its refusal gate, and a follow-up prompt refines the active
  Mutation. With several Providers the lab shows a picker, CLI-first; with
  none, the mutation UI is absent.
- 9042bb1: Surface refused writes as an actionable diff. A TokenSource refusal now carries a best-effort unified diff of the change it declined to make — computed textually, so it exists even for a file the dialect cannot parse — instead of the internal round-trip discrepancy. In the lab UI a refused commit renders that diff (via @pierre/diffs, lazy-loaded so the renderer stays out of the initial bundle) with the refusal reason and a "Copy patch" action, so applying the change by hand takes seconds. No file is ever mutated by a refused commit.
- 2774cbc: Add the shadow editor: a presets tab for picking a look fast and a decomposed-sliders tab (offset-x, offset-y, blur, spread, color) for tuning precisely. Whatever tab an edit comes from, the stored token value is always the one composed box-shadow string, previewed live and committed through the ordinary edit path. A value the sliders cannot decompose (multi-layer, var()) still takes presets and hand edits, and an app with no shadow tokens shows no shadow section.
- 2a64c79: Add the spacing editor: a headline density multiplier that live-previews across all spacing tokens at once, with per-token detail underneath for fine-tuning. Per-token base overrides compose with the multiplier (effective value = base × density), commit writes the computed values back through the ordinary edit path, and reset restores the original values. Spacing controls survive a reload of the lab UI, like other unsaved edits.

### Patch Changes

- 56f8a07: Route the Workers AI and OpenRouter Providers through Cloudflare AI Gateway. `detectProviders` gains a Workers AI provider (id `workers-ai`), enabled when `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID`, and `CLOUDFLARE_API_TOKEN` are all set (model overridable via `WORKERS_AI_MODEL`). When the same Cloudflare account and gateway are set, OpenRouter is also routed through the gateway instead of hit directly; the detection ladder is now claude, codex, workers-ai, openrouter.
- 8454f3c: Fix the package entry points: `main`, `types`, and `exports` now name the `.mjs` and `.d.mts` files the build actually emits, so importing the published packages resolves.
- Updated dependencies [56f8a07]
- Updated dependencies [8454f3c]
- Updated dependencies [8ee743b]
- Updated dependencies [bfc0078]
- Updated dependencies [9042bb1]
- Updated dependencies [b7191a0]
  - @fittingroom/core@0.1.0
