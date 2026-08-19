---
"fittingroom": minor
---

Serve the real laboratory UI and complete the color edit loop. The plugin now serves the built lab UI at the dev-only route (default `/__fittingroom`), answers Protocol requests over HTTP at `<route>/api` against the app's own token CSS (auto-detected by content in the root and `src/`, or set via the new `cssFile` option), and injects a preview client into the host app's pages so the lab's iframe Preview applies edits live as CSS-variable overrides — no file writes until commit. Commits go through the TokenSource write path (round-trip refusal included) and produce minimal value-only diffs. The endpoint exists only in dev serve mode and refuses cross-origin requests. Unsaved edits survive a reload of the lab UI.
