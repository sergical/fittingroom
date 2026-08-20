import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createFakeAdapter,
  createTokenSourceAdapter,
  createTokenSource,
  parseProtocolRequest,
} from "../src/index.js";
import type {
  MutationRequest,
  Provider,
  ProtocolAdapter,
  ProtocolResponse,
} from "../src/index.js";
import { tempFile } from "./helpers.js";

const shadcnGlobals = readFileSync(
  fileURLToPath(new URL("./fixtures/shadcn-globals.css", import.meta.url)),
  "utf8",
);

// Detected as shadcn (`.dark` rule) but the block is never closed, so
// every write through the real adapter is refused.
const unparseableCss = ":root {\n  --primary: red;\n}\n.dark {\n  --primary: blue;\n";

/**
 * How the conformance suite obtains each adapter. Both factories return
 * an adapter over a document that contains `--primary` as a light/dark
 * pair with the shadcn-globals fixture's values — the fake's built-in
 * sample document mirrors that fixture.
 */
interface Harness {
  adapter: string;
  make(providers?: Provider[]): ProtocolAdapter;
  /** An adapter whose commits are always refused. */
  makeRefusing(): ProtocolAdapter;
}

/** Creates the real adapter over a temp fixture app (CSS file + fits dir). */
function makeReal(css: string, providers?: Provider[]): ProtocolAdapter {
  const cssPath = tempFile(css);
  return createTokenSourceAdapter({
    source: createTokenSource(cssPath),
    fitsDir: join(dirname(cssPath), ".fittingroom"),
    providers,
  });
}

const harnesses: Harness[] = [
  {
    adapter: "fake",
    make: (providers) => createFakeAdapter({ providers }),
    makeRefusing: () =>
      createFakeAdapter({
        refusal: { reason: "simulated refusal", diff: "--- a\n+++ b\n" },
      }),
  },
  {
    adapter: "token-source",
    make: (providers) => makeReal(shadcnGlobals, providers),
    makeRefusing: () => makeReal(unparseableCss),
  },
];

/** A Provider that answers with canned edits and records what it was asked. */
function fakeProvider(
  id: string,
  kind: "cli" | "api",
  edits: Record<string, string | { light?: string; dark?: string }>,
): Provider & { requests: MutationRequest[] } {
  const requests: MutationRequest[] = [];
  return {
    id,
    label: `Fake ${id}`,
    kind,
    requests,
    async mutate(request) {
      requests.push(request);
      return edits;
    },
  };
}

function tokenValue(response: ProtocolResponse, name: string) {
  if (response.type !== "document" && response.type !== "previewed") {
    throw new Error(`expected a document response, got ${response.type}`);
  }
  return response.document?.tokens.find((t) => t.name === name)?.value;
}

describe.each(harnesses)("$adapter adapter protocol conformance", (h) => {
  it("read returns the TokenDocument tagged with its dialect", async () => {
    const response = await h.make().handle({ type: "read" });

    expect(response.type).toBe("document");
    if (response.type === "document") {
      expect(response.document?.dialect).toBe("shadcn");
    }
    expect(tokenValue(response, "--primary")).toEqual({
      light: "oklch(0.205 0 0)",
      dark: "oklch(0.922 0 0)",
    });
  });

  it("preview merges a string edit into the light half without committing", async () => {
    const adapter = h.make();
    const response = await adapter.handle({
      type: "preview",
      edits: { "--primary": "oklch(0.5 0.1 260)" },
    });

    expect(response.type).toBe("previewed");
    expect(tokenValue(response, "--primary")).toEqual({
      light: "oklch(0.5 0.1 260)",
      dark: "oklch(0.922 0 0)",
    });

    // Preview never touches the committed state.
    const reread = await adapter.handle({ type: "read" });
    expect(tokenValue(reread, "--primary")?.light).toBe("oklch(0.205 0 0)");
  });

  it("preview with a dark-half edit targets only the dark half", async () => {
    const response = await h.make().handle({
      type: "preview",
      edits: { "--primary": { dark: "oklch(0.8 0 0)" } },
    });

    expect(tokenValue(response, "--primary")).toEqual({
      light: "oklch(0.205 0 0)",
      dark: "oklch(0.8 0 0)",
    });
  });

  it("commit applies edits; a subsequent read reflects them", async () => {
    const adapter = h.make();
    const response = await adapter.handle({
      type: "commit",
      edits: { "--primary": "oklch(0.5 0.1 260)" },
    });

    expect(response).toEqual({ type: "committed" });
    const reread = await adapter.handle({ type: "read" });
    expect(tokenValue(reread, "--primary")?.light).toBe("oklch(0.5 0.1 260)");
  });

  it("a refused commit travels through with its reason and diff intact", async () => {
    const response = await h.makeRefusing().handle({
      type: "commit",
      edits: { "--primary": "green" },
    });

    expect(response.type).toBe("refused");
    if (response.type === "refused") {
      expect(response.reason).not.toBe("");
      expect(response.diff).not.toBe("");
    }
  });

  it("fits: save, list, apply, delete round-trip", async () => {
    const adapter = h.make();
    const edits = { "--primary": "oklch(0.5 0.1 260)" };

    const saved = await adapter.handle({ type: "save-fit", name: "moody", edits });
    expect(saved).toEqual({ type: "fit-saved", fit: { name: "moody", edits } });

    const listed = await adapter.handle({ type: "list-fits" });
    expect(listed).toEqual({ type: "fits", fits: [{ name: "moody", edits }] });

    const applied = await adapter.handle({ type: "apply-fit", name: "moody" });
    expect(applied).toEqual({
      type: "fit-applied",
      fit: { name: "moody", edits },
    });

    const deleted = await adapter.handle({ type: "delete-fit", name: "moody" });
    expect(deleted).toEqual({ type: "fit-deleted", name: "moody" });
    expect(await adapter.handle({ type: "list-fits" })).toEqual({
      type: "fits",
      fits: [],
    });
  });

  it("saving a fit under an existing name replaces it", async () => {
    const adapter = h.make();
    await adapter.handle({
      type: "save-fit",
      name: "moody",
      edits: { "--primary": "red" },
    });
    await adapter.handle({
      type: "save-fit",
      name: "moody",
      edits: { "--primary": "blue" },
    });

    expect(await adapter.handle({ type: "list-fits" })).toEqual({
      type: "fits",
      fits: [{ name: "moody", edits: { "--primary": "blue" } }],
    });
  });

  it("applying or deleting an unknown fit is an error naming it", async () => {
    const adapter = h.make();
    for (const type of ["apply-fit", "delete-fit"] as const) {
      const response = await adapter.handle({ type, name: "ghost" });
      expect(response.type).toBe("error");
      if (response.type === "error") {
        expect(response.message).toContain("ghost");
      }
    }
  });

  it("refuses fit names that could escape the fit store", async () => {
    const adapter = h.make();
    for (const name of ["", ".", "..", "../evil", "a/b", "a\\b", ".hidden"]) {
      const saved = await adapter.handle({ type: "save-fit", name, edits: {} });
      expect(saved.type).toBe("error");
      for (const type of ["apply-fit", "delete-fit"] as const) {
        const response = await adapter.handle({ type, name });
        expect(response.type).toBe("error");
        if (response.type === "error") {
          expect(response.message).toContain("not a valid fit name");
        }
      }
    }
    expect(await adapter.handle({ type: "list-fits" })).toEqual({
      type: "fits",
      fits: [],
    });
  });

  it("list-providers answers with identities only, in detection order", async () => {
    const providers = [
      fakeProvider("claude", "cli", {}),
      fakeProvider("openrouter", "api", {}),
    ];
    const response = await h.make(providers).handle({ type: "list-providers" });

    expect(response).toEqual({
      type: "providers",
      providers: [
        { id: "claude", label: "Fake claude", kind: "cli" },
        { id: "openrouter", label: "Fake openrouter", kind: "api" },
      ],
    });
  });

  it("zero Providers list as empty — the feature is absent, not broken", async () => {
    expect(await h.make().handle({ type: "list-providers" })).toEqual({
      type: "providers",
      providers: [],
    });
  });

  it("mutate hands the Provider the prompt, document, and refined edits", async () => {
    const provider = fakeProvider("claude", "cli", {
      "--primary": { light: "oklch(0.7 0.1 40)" },
      "--imaginary": "red",
    });
    const response = await h.make([provider]).handle({
      type: "mutate",
      providerId: "claude",
      prompt: "warmer",
      baseEdits: { "--primary": "blue" },
    });

    // Edits to tokens the document does not hold are dropped.
    expect(response).toEqual({
      type: "mutation",
      edits: { "--primary": { light: "oklch(0.7 0.1 40)" } },
    });
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0].prompt).toBe("warmer");
    expect(provider.requests[0].baseEdits).toEqual({ "--primary": "blue" });
    expect(
      provider.requests[0].document.tokens.map((token) => token.name),
    ).toContain("--primary");
  });

  it("mutate naming an unknown Provider is an error naming it", async () => {
    const response = await h
      .make([fakeProvider("claude", "cli", {})])
      .handle({ type: "mutate", providerId: "ghost", prompt: "x" });

    expect(response.type).toBe("error");
    if (response.type === "error") {
      expect(response.message).toContain("ghost");
    }
  });

  it("a Provider failure travels back as a Protocol error", async () => {
    const provider: Provider = {
      id: "claude",
      label: "Claude CLI",
      kind: "cli",
      mutate: async () => {
        throw new Error("the CLI exited 1");
      },
    };
    const response = await h
      .make([provider])
      .handle({ type: "mutate", providerId: "claude", prompt: "x" });

    expect(response).toEqual({
      type: "error",
      message: "Claude CLI failed to mutate: the CLI exited 1",
    });
  });
});

describe("parseProtocolRequest", () => {
  it("accepts the mutation messages", () => {
    expect(parseProtocolRequest({ type: "list-providers" })).toEqual({
      type: "list-providers",
    });
    expect(
      parseProtocolRequest({ type: "mutate", providerId: "claude", prompt: "x" }),
    ).toEqual({ type: "mutate", providerId: "claude", prompt: "x" });
    expect(
      parseProtocolRequest({
        type: "mutate",
        providerId: "claude",
        prompt: "x",
        baseEdits: { "--primary": { dark: "black" } },
      }),
    ).toEqual({
      type: "mutate",
      providerId: "claude",
      prompt: "x",
      baseEdits: { "--primary": { dark: "black" } },
    });
  });

  it("rejects malformed mutation messages", () => {
    expect(parseProtocolRequest({ type: "mutate", prompt: "x" })).toBeNull();
    expect(
      parseProtocolRequest({ type: "mutate", providerId: "claude" }),
    ).toBeNull();
    expect(
      parseProtocolRequest({
        type: "mutate",
        providerId: "claude",
        prompt: "x",
        baseEdits: { "--primary": 3 },
      }),
    ).toBeNull();
  });
});

describe("fake adapter", () => {
  it("passes a configured refusal through verbatim", async () => {
    const adapter = createFakeAdapter({
      refusal: { reason: "simulated refusal", diff: "--- a\n+++ b\n" },
    });
    const response = await adapter.handle({ type: "commit", edits: {} });

    expect(response).toEqual({
      type: "refused",
      reason: "simulated refusal",
      diff: "--- a\n+++ b\n",
    });
  });

  it("serves a caller-provided document instead of the sample", async () => {
    const document = {
      dialect: "emdash" as const,
      tokens: [{ name: "--spacing-md", value: { raw: "1rem" } }],
    };
    const response = await createFakeAdapter({ document }).handle({
      type: "read",
    });

    expect(response).toEqual({ type: "document", document });
  });

  it("keeps state per instance", async () => {
    const a = createFakeAdapter();
    const b = createFakeAdapter();
    await a.handle({ type: "save-fit", name: "moody", edits: {} });

    expect(await b.handle({ type: "list-fits" })).toEqual({
      type: "fits",
      fits: [],
    });
  });

  it("a string edit on a raw-valued token previews onto raw", async () => {
    const adapter = createFakeAdapter({
      document: {
        dialect: "emdash",
        tokens: [{ name: "--spacing-md", value: { raw: "1rem" } }],
      },
    });
    const response = await adapter.handle({
      type: "preview",
      edits: { "--spacing-md": "1.25rem" },
    });

    expect(tokenValue(response, "--spacing-md")).toEqual({ raw: "1.25rem" });
  });
});

describe("token-source adapter", () => {
  it("persists fits across adapter instances over the same fits dir", async () => {
    const cssPath = tempFile(shadcnGlobals);
    const fitsDir = join(dirname(cssPath), ".fittingroom");
    const make = () =>
      createTokenSourceAdapter({
        source: createTokenSource(cssPath),
        fitsDir,
      });

    await make().handle({
      type: "save-fit",
      name: "moody",
      edits: { "--primary": "blue" },
    });

    expect(await make().handle({ type: "list-fits" })).toEqual({
      type: "fits",
      fits: [{ name: "moody", edits: { "--primary": "blue" } }],
    });
  });

  it("a commit against an unparseable target refuses with the declined change as a diff; the file is untouched", async () => {
    const cssPath = tempFile(unparseableCss);
    const adapter = createTokenSourceAdapter({
      source: createTokenSource(cssPath),
      fitsDir: join(dirname(cssPath), ".fittingroom"),
    });

    const response = await adapter.handle({
      type: "commit",
      edits: { "--primary": { light: "green" } },
    });

    expect(response.type).toBe("refused");
    if (response.type === "refused") {
      expect(response.reason).toContain("cannot be parsed");
      expect(response.diff).toContain("-  --primary: red;");
      expect(response.diff).toContain("+  --primary: green;");
    }
    expect(readFileSync(cssPath, "utf8")).toBe(unparseableCss);
  });

  it("read and preview report a file in no known dialect", async () => {
    const adapter = makeReal("body { color: red; }\n");

    expect(await adapter.handle({ type: "read" })).toEqual({
      type: "document",
      document: null,
    });
    const previewed = await adapter.handle({
      type: "preview",
      edits: { "--primary": "blue" },
    });
    expect(previewed.type).toBe("error");
  });
});
