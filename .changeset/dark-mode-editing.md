---
"fittingroom": minor
---

Dark-mode editing, edit what you see: a color-scheme toggle above the Preview flips the host app into dark mode (setting the `.dark` class and pinning `color-scheme`, so both shadcn class-based pairs and emdash `light-dark()` values follow). The editors show the previewed scheme's half of each light/dark pair, and an edit targets only that half — light and dark are edited independently through one flow and commit as ordinary scheme-targeted edits. The preview client now keeps one override rule per scheme, so a light-half preview never leaks into dark mode or vice versa.
