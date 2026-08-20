import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import type { Edits } from "../model/types.js";
import {
  buildMutationPrompt,
  parseMutationEdits,
  type MutationRequest,
  type Provider,
} from "./provider.js";

const execFileAsync = promisify(execFile);

export interface DetectProvidersOptions {
  /** Defaults to process.env. Injectable so contract tests stub the PATH and API keys. */
  env?: Record<string, string | undefined>;
  /** Defaults to the global fetch. Injectable so the OpenRouter contract test needs no network. */
  fetchImpl?: typeof fetch;
}

/** The first executable named `binary` on the PATH, or null. */
function findExecutable(
  binary: string,
  env: Record<string, string | undefined>,
): string | null {
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (dir === "") continue;
    const candidate = join(dir, binary);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not here; keep looking
    }
  }
  return null;
}

/** Mutations can genuinely take minutes; the ceiling only reaps a hung CLI. */
const CLI_TIMEOUT_MS = 5 * 60 * 1000;
const CLI_MAX_BUFFER = 10 * 1024 * 1024;

interface CliSpec {
  id: string;
  label: string;
  binary: string;
  /** The argv that pipes the CLI headlessly: print the answer, then exit. */
  args(prompt: string): string[];
}

/**
 * Detection order within CLIs; `detectProviders` keeps it. Each argv pins
 * the CLI to a read-only mode (`--permission-mode plan`, `--sandbox
 * read-only`): a Provider proposes Edits over stdout, and the commit path
 * is the only place a Mutation may touch files — a prompt that asks the
 * CLI to edit the token CSS directly must not be able to.
 */
const CLI_SPECS: CliSpec[] = [
  {
    id: "claude",
    label: "Claude CLI",
    binary: "claude",
    args: (p) => ["-p", "--permission-mode", "plan", p],
  },
  {
    id: "codex",
    label: "Codex CLI",
    binary: "codex",
    args: (p) => ["exec", "--sandbox", "read-only", p],
  },
];

function cliProvider(spec: CliSpec, executable: string): Provider {
  return {
    id: spec.id,
    label: spec.label,
    kind: "cli",
    async mutate(request: MutationRequest): Promise<Edits> {
      const { stdout } = await execFileAsync(
        executable,
        spec.args(buildMutationPrompt(request)),
        { timeout: CLI_TIMEOUT_MS, maxBuffer: CLI_MAX_BUFFER },
      );
      return parseMutationEdits(stdout);
    },
  };
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
const WORKERS_AI_DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** The gateway URL for `provider` (e.g. "openrouter", "workers-ai") when routed through Cloudflare AI Gateway. */
function aiGatewayUrl(
  accountId: string,
  gatewayId: string,
  provider: string,
): string {
  return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/${provider}/v1/chat/completions`;
}

/**
 * Shared shape for OpenAI-compatible chat-completions APIs (OpenRouter,
 * Workers AI via AI Gateway): a Bearer key, a `model` + single user
 * message body, and a `choices[0].message.content` response.
 */
function openAiChatProvider(
  id: string,
  label: string,
  url: string,
  key: string,
  model: string,
  fetchImpl: typeof fetch,
): Provider {
  return {
    id,
    label,
    kind: "api",
    async mutate(request: MutationRequest): Promise<Edits> {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: buildMutationPrompt(request) }],
        }),
      });
      if (!response.ok) {
        throw new Error(`${label} answered ${response.status}`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error(`${label}'s response carries no message content`);
      }
      return parseMutationEdits(content);
    },
  };
}

/**
 * Detects the Providers available on this machine, CLI-first: installed
 * coding-agent CLIs (claude, then codex), then Workers AI via Cloudflare AI
 * Gateway when `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY_ID`, and
 * `CLOUDFLARE_API_TOKEN` are all set, then OpenRouter when
 * `OPENROUTER_API_KEY` is set (model overridable via `OPENROUTER_MODEL`).
 * When the same Cloudflare account/gateway pair is set, OpenRouter is also
 * routed through the gateway rather than hit directly. Zero hits means the
 * mutation feature is absent, not broken.
 */
export function detectProviders(
  options: DetectProvidersOptions = {},
): Provider[] {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const providers: Provider[] = [];
  for (const spec of CLI_SPECS) {
    const executable = findExecutable(spec.binary, env);
    if (executable) providers.push(cliProvider(spec, executable));
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const gatewayId = env.CLOUDFLARE_AI_GATEWAY_ID;
  const gatewayToken = env.CLOUDFLARE_API_TOKEN;
  if (accountId && gatewayId && gatewayToken) {
    providers.push(
      openAiChatProvider(
        "workers-ai",
        "Workers AI",
        aiGatewayUrl(accountId, gatewayId, "workers-ai"),
        gatewayToken,
        env.WORKERS_AI_MODEL ?? WORKERS_AI_DEFAULT_MODEL,
        fetchImpl,
      ),
    );
  }

  const key = env.OPENROUTER_API_KEY;
  if (key) {
    const url =
      accountId && gatewayId
        ? aiGatewayUrl(accountId, gatewayId, "openrouter")
        : OPENROUTER_URL;
    providers.push(
      openAiChatProvider(
        "openrouter",
        "OpenRouter",
        url,
        key,
        env.OPENROUTER_MODEL ?? OPENROUTER_DEFAULT_MODEL,
        fetchImpl,
      ),
    );
  }

  return providers;
}
