import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectProviders } from "../src/index.js";
import type { TokenDocument } from "../src/index.js";

const document: TokenDocument = {
  dialect: "shadcn",
  tokens: [
    { name: "--primary", value: { light: "oklch(0.205 0 0)" } },
    { name: "--radius", value: { raw: "0.5rem" } },
  ],
};

/**
 * Writes an executable stub named `name` into a fresh temp dir. The stub
 * records its argv to `<dir>/argv` and prints `output`, standing in for
 * the real CLI in contract tests.
 */
function stubBinaryDir(name: string, output: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fittingroom-bin-"));
  const path = join(dir, name);
  writeFileSync(
    path,
    `#!/bin/sh\nprintf '%s\\0' "$@" > "${dir}/argv"\ncat <<'FITTINGROOM_EOF'\n${output}\nFITTINGROOM_EOF\n`,
  );
  chmodSync(path, 0o755);
  return dir;
}

function argvOf(dir: string): string[] {
  // The stub writes argv NUL-separated: prompts hold newlines of their own.
  return readFileSync(join(dir, "argv"), "utf8").split("\0").slice(0, -1);
}

describe("Provider detection", () => {
  it("finds installed CLIs and the API fallback, CLI-first", () => {
    const claudeDir = stubBinaryDir("claude", "{}");
    const codexDir = stubBinaryDir("codex", "{}");
    const providers = detectProviders({
      env: {
        PATH: `${claudeDir}:${codexDir}`,
        OPENROUTER_API_KEY: "sk-or-test",
      },
    });

    expect(providers.map((p) => p.id)).toEqual(["claude", "codex", "openrouter"]);
    expect(providers.map((p) => p.kind)).toEqual(["cli", "cli", "api"]);
  });

  it("zero hits means the feature is absent, not broken", () => {
    expect(detectProviders({ env: { PATH: "" } })).toEqual([]);
  });

  it("skips a CLI that is not on the PATH", () => {
    const codexDir = stubBinaryDir("codex", "{}");
    const providers = detectProviders({ env: { PATH: codexDir } });

    expect(providers.map((p) => p.id)).toEqual(["codex"]);
  });
});

describe("claude CLI adapter contract", () => {
  it("pipes the prompt headlessly and parses the printed edit set", async () => {
    const dir = stubBinaryDir(
      "claude",
      'Here you go:\n{"--primary": {"light": "oklch(0.7 0.1 40)"}, "--radius": "1rem"}',
    );
    const [claude] = detectProviders({ env: { PATH: dir } });

    const edits = await claude.mutate({ prompt: "1970s ski lodge", document });

    expect(edits).toEqual({
      "--primary": { light: "oklch(0.7 0.1 40)" },
      "--radius": "1rem",
    });
    const argv = argvOf(dir);
    expect(argv[0]).toBe("-p");
    expect(argv[1]).toContain("1970s ski lodge");
    expect(argv[1]).toContain("--primary");
  });

  it("a follow-up prompt carries the Mutation being refined", async () => {
    const dir = stubBinaryDir("claude", '{"--radius": "2rem"}');
    const [claude] = detectProviders({ env: { PATH: dir } });

    await claude.mutate({
      prompt: "warmer",
      document,
      baseEdits: { "--radius": "1rem" },
    });

    expect(argvOf(dir)[1]).toContain('"--radius": "1rem"');
  });

  it("rejects output that contains no edit set", async () => {
    const dir = stubBinaryDir("claude", "I cannot help with that.");
    const [claude] = detectProviders({ env: { PATH: dir } });

    await expect(claude.mutate({ prompt: "x", document })).rejects.toThrow(
      /no JSON edit set/,
    );
  });
});

describe("codex CLI adapter contract", () => {
  it("runs `codex exec` and parses the last edit set out of the log noise", async () => {
    const dir = stubBinaryDir(
      "codex",
      '[2026-08-19] session start {"model": "gpt"}\nthinking...\n{"--primary": "teal"}',
    );
    const [codex] = detectProviders({ env: { PATH: dir } });

    const edits = await codex.mutate({ prompt: "make it teal", document });

    expect(edits).toEqual({ "--primary": "teal" });
    const argv = argvOf(dir);
    expect(argv[0]).toBe("exec");
    expect(argv[1]).toContain("make it teal");
  });
});

describe("OpenRouter adapter contract", () => {
  it("posts the prompt with the key and parses the completion", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: 'Sure: {"--primary": {"dark": "black"}}' } },
          ],
        }),
      );
    }) as typeof fetch;
    const [openrouter] = detectProviders({
      env: { PATH: "", OPENROUTER_API_KEY: "sk-or-test" },
      fetchImpl,
    });

    const edits = await openrouter.mutate({ prompt: "darker", document });

    expect(edits).toEqual({ "--primary": { dark: "black" } });
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-test");
    const body = JSON.parse(calls[0].init.body as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).not.toBe("");
    expect(body.messages[0].content).toContain("darker");
    expect(body.messages[0].content).toContain("--primary");
  });

  it("a non-2xx answer rejects with the status", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 401 })) as typeof fetch;
    const [openrouter] = detectProviders({
      env: { PATH: "", OPENROUTER_API_KEY: "bad" },
      fetchImpl,
    });

    await expect(openrouter.mutate({ prompt: "x", document })).rejects.toThrow(
      /401/,
    );
  });
});
