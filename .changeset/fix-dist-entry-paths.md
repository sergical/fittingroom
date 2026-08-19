---
"@fittingroom/core": patch
"fittingroom": patch
---

Fix the package entry points: `main`, `types`, and `exports` now name the `.mjs` and `.d.mts` files the build actually emits, so importing the published packages resolves.
