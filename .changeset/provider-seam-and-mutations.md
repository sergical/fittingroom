---
"@fittingroom/core": minor
---

Add the Provider seam for AI Mutations. A Provider turns a natural-language
prompt and the TokenDocument into Edits. `detectProviders` finds what the
developer's machine already has, CLI-first: the `claude` and `codex` CLIs
piped headlessly, then OpenRouter as an API fallback when
`OPENROUTER_API_KEY` is set. Zero hits means the feature is absent, not
broken. The Protocol gains two messages — `list-providers` and `mutate` —
so the lab UI stays a pure Protocol client; a follow-up `mutate` carries
`baseEdits` so the Provider refines the active Mutation instead of
restarting.
