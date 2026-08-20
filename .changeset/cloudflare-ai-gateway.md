---
"@fittingroom/core": patch
"fittingroom": patch
---

Route the Workers AI and OpenRouter Providers through Cloudflare AI Gateway. `detectProviders` gains a Workers AI provider (id `workers-ai`), enabled when `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID`, and `CLOUDFLARE_API_TOKEN` are all set (model overridable via `WORKERS_AI_MODEL`). When the same Cloudflare account and gateway are set, OpenRouter is also routed through the gateway instead of hit directly; the detection ladder is now claude, codex, workers-ai, openrouter.
