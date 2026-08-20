# Project status — 2026-08-20

Point-in-time handoff note. Verify against `git log` and the issue tracker
before trusting details; delete or rewrite this file when it goes stale.

## Where things stand

- All 14 v1 tickets (#2–#16, spec in #1) are implemented, reviewed, and pushed
  to `main`. Each landed with tests green (`pnpm build && pnpm test`), a
  behavior-preserving simplification pass, and an adversarial review with
  must-fix findings resolved.
- Published packages: `@fittingroom/core` and `fittingroom` (the Vite plugin).
  `@fittingroom/ui` is private and is bundled into the plugin's `dist/ui`.
- Versions on npm are still 0.0.1. **PR #17 ("Version Packages") publishes the
  next versions when merged** — all changesets, including the Cloudflare ones,
  are folded into it.

## Cloudflare stack (account SERG.TECH, id a6221d3398c2e695ab8e1a2f1237bd1b)

- **Hosted demo**: https://fittingroom-demo.s-a62.workers.dev — Workers static
  assets, config in `packages/ui/wrangler.jsonc`, built from
  `packages/ui/dist-demo`. Last deploys were run locally via
  `npx wrangler deploy` (OAuth login, personal account).
- **AI providers** (`packages/core/src/provider/detect.ts`): detection ladder
  is claude CLI → codex CLI → Workers AI → OpenRouter. Both API providers
  route through Cloudflare AI Gateway when `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_AI_GATEWAY_ID` are set; OpenRouter falls back to a direct call
  otherwise. Workers AI also needs `CLOUDFLARE_API_TOKEN`; model override via
  `WORKERS_AI_MODEL` (default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
- The lab UI has a provider dropdown; the choice persists in localStorage
  (`fittingroom:provider-id`) and falls back to CLI-first when the stored
  provider is no longer detected.

## Open items (need the repo owner)

1. **Create the AI Gateway** named `fittingroom` in the Cloudflare dash
   (AI → AI Gateway → Create) — wrangler's OAuth cannot manage gateways.
   Until it exists, the Workers AI / OpenRouter fallbacks stay dormant;
   the claude/codex CLI providers work regardless.
2. **GitHub Actions secrets** `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit)
   and `CLOUDFLARE_ACCOUNT_ID` — the `Deploy demo` workflow stays red until
   these exist.
3. **Merge PR #17** to publish the packages.
4. GitHub Actions is not permitted to create PRs on this repo — the changesets
   Release job updates PR #17 fine, but if that PR is ever closed without a
   replacement branch, the next Release run fails at PR creation again.
   Fix permanently in Settings → Actions → General, or via
   `gh api -X PUT repos/sergical/fittingroom/actions/permissions/workflow -f default_workflow_permissions=write -F can_approve_pull_request_reviews=true`.
5. Issue #7's GitHub body is a copy-paste of #8's font-editor text; the shadow
   editor was implemented per the title. Fix the issue body.
6. Dogfood (#10): add `fittingroomAstro()` to serg-tech-astro's
   `astro.config.mjs` and run its dev server.

## Testing end to end

From the repo root: `pnpm install && pnpm build`, then run
`examples/vite-app` (shadcn dialect) or `examples/emdash-app` (emdash
dialect) with their dev servers and open `/__fittingroom/`. Playwright e2e
suites live in `examples/*/test/`. To exercise Workers AI locally, export the
three `CLOUDFLARE_*` vars above in the shell running the dev server.

## Ideas parked from the plannotator comparison

Plannotator (~/src/plannotator) is a one-shot decision gate (browser opens,
server blocks on approve/deny); fittingroom is a long-running editor, so its
core flow does not transfer. Worth borrowing later:

- Key drafts by content hash of the token document (plus a generation guard)
  so drafts go stale safely when the file changes underneath.
- An SSE side channel on the plugin middleware to push "source changed,
  re-read" to the lab.
- A blocking approve/deny gate if an "agent proposes a Fit → human approves"
  flow is ever added.
- Echo dialect/file-hash/plugin-version metadata in the `read` response as a
  staleness handshake.
