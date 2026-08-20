// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createFakeAdapter } from "@fittingroom/core";
import type {
  Edits,
  MutationRequest,
  Provider,
  ProtocolAdapter,
  ProtocolRequest,
  ProtocolResponse,
} from "@fittingroom/core";
import App from "../src/App.js";

/** A Provider that answers with canned edits and records what it was asked. */
function fakeProvider(
  id: string,
  kind: "cli" | "api",
  edits: Edits,
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

function inputValue(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value;
}

async function requestMutation(prompt: string) {
  fireEvent.change(await screen.findByLabelText("Mutation prompt"), {
    target: { value: prompt },
  });
  fireEvent.click(screen.getByRole("button", { name: /Mutate|Refine/ }));
}

describe("the Mutation flow", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("zero Providers means the mutation UI is absent", async () => {
    render(<App adapter={createFakeAdapter()} />);
    await screen.findByLabelText("--primary value");

    expect(screen.queryByLabelText("Mutation prompt")).toBeNull();
  });

  it("one Provider shows the prompt without a picker", async () => {
    const adapter = createFakeAdapter({
      providers: [fakeProvider("claude", "cli", {})],
    });
    render(<App adapter={adapter} />);

    await screen.findByLabelText("Mutation prompt");
    expect(screen.queryByLabelText("Mutation provider")).toBeNull();
  });

  it("several Providers show a picker in the served CLI-first order", async () => {
    const adapter = createFakeAdapter({
      providers: [
        fakeProvider("claude", "cli", {}),
        fakeProvider("codex", "cli", {}),
        fakeProvider("openrouter", "api", {}),
      ],
    });
    render(<App adapter={adapter} />);

    const picker = (await screen.findByLabelText(
      "Mutation provider",
    )) as HTMLSelectElement;
    expect([...picker.options].map((option) => option.value)).toEqual([
      "claude",
      "codex",
      "openrouter",
    ]);
    // CLI-first default: the first served Provider is preselected.
    expect(picker.value).toBe("claude");
  });

  it("a prompt lands as an unsaved Fit: drafted, previewed, committable", async () => {
    const adapter = createFakeAdapter({
      providers: [
        fakeProvider("claude", "cli", {
          "--primary": { light: "oklch(0.7 0.1 40)" },
        }),
      ],
    });
    render(<App adapter={adapter} />);

    await requestMutation("1970s ski lodge");

    // The Mutation is a draft: the editor shows it and Commit counts it.
    await expect
      .poll(() => inputValue("--primary value"))
      .toBe("oklch(0.7 0.1 40)");
    expect(
      screen.getByRole("button", { name: "Commit 1 edit" }),
    ).toHaveProperty("disabled", false);

    // Committing it goes through the ordinary write path.
    fireEvent.click(screen.getByRole("button", { name: "Commit 1 edit" }));
    await expect
      .poll(async () => {
        const read = await adapter.handle({ type: "read" });
        if (read.type !== "document") return undefined;
        return read.document?.tokens.find((t) => t.name === "--primary")?.value
          .light;
      })
      .toBe("oklch(0.7 0.1 40)");
  });

  it("committing a Mutation passes the same refusal gate as manual edits", async () => {
    const adapter = createFakeAdapter({
      refusal: { reason: "simulated refusal", diff: "--- a\n+++ b\n" },
      providers: [fakeProvider("claude", "cli", { "--primary": "green" })],
    });
    render(<App adapter={adapter} />);

    await requestMutation("greener");
    await expect.poll(() => inputValue("--primary value")).toBe("green");
    fireEvent.click(screen.getByRole("button", { name: /Commit/ }));

    await screen.findByText(/simulated refusal/);
  });

  it("a follow-up prompt refines the active Mutation instead of restarting", async () => {
    const provider = fakeProvider("claude", "cli", {
      "--primary": { light: "oklch(0.7 0.1 40)" },
    });
    render(<App adapter={createFakeAdapter({ providers: [provider] })} />);

    await requestMutation("1970s ski lodge");
    await expect
      .poll(() => inputValue("--primary value"))
      .toBe("oklch(0.7 0.1 40)");

    await requestMutation("warmer");

    await expect.poll(() => provider.requests.length).toBe(2);
    expect(provider.requests[0].baseEdits).toBeUndefined();
    expect(provider.requests[1].baseEdits).toEqual({
      "--primary": { light: "oklch(0.7 0.1 40)" },
    });
  });

  it("a Provider failure surfaces as the lab's error", async () => {
    const provider: Provider = {
      id: "claude",
      label: "Claude CLI",
      kind: "cli",
      mutate: async () => {
        throw new Error("the CLI exited 1");
      },
    };
    render(<App adapter={createFakeAdapter({ providers: [provider] })} />);

    await requestMutation("anything");

    await screen.findByText(/Claude CLI failed to mutate/);
  });

  it("the chosen Provider survives a reload", async () => {
    const providers = [
      fakeProvider("claude", "cli", {}),
      fakeProvider("codex", "cli", {}),
    ];
    const { unmount } = render(<App adapter={createFakeAdapter({ providers })} />);

    const picker = (await screen.findByLabelText(
      "Mutation provider",
    )) as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: "codex" } });
    await expect.poll(() => picker.value).toBe("codex");
    unmount();

    // A fresh App instance — the reload — restores the stored choice
    // instead of the CLI-first default.
    render(<App adapter={createFakeAdapter({ providers })} />);
    const reloadedPicker = (await screen.findByLabelText(
      "Mutation provider",
    )) as HTMLSelectElement;
    expect(reloadedPicker.value).toBe("codex");
  });

  it("a stored Provider absent from the detected list falls back to the default", async () => {
    localStorage.setItem("fittingroom:provider-id", "gone");
    const adapter = createFakeAdapter({
      providers: [fakeProvider("claude", "cli", {}), fakeProvider("codex", "cli", {})],
    });
    render(<App adapter={adapter} />);

    const picker = (await screen.findByLabelText(
      "Mutation provider",
    )) as HTMLSelectElement;
    expect(picker.value).toBe("claude");
  });

  it("a list-providers error leaves the feature absent, not broken", async () => {
    const inner = createFakeAdapter();
    const adapter: ProtocolAdapter = {
      async handle(request: ProtocolRequest): Promise<ProtocolResponse> {
        if (request.type === "list-providers") {
          return { type: "error", message: "no token CSS file detected" };
        }
        return inner.handle(request);
      },
    };
    render(<App adapter={adapter} />);
    await screen.findByLabelText("--primary value");

    expect(screen.queryByLabelText("Mutation prompt")).toBeNull();
    expect(screen.queryByText("no token CSS file detected")).toBeNull();
  });
});
