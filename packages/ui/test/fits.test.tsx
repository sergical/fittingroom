// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createFakeAdapter } from "@fittingroom/core";
import type {
  ProtocolAdapter,
  ProtocolRequest,
  ProtocolResponse,
} from "@fittingroom/core";
import App from "../src/App.js";

/**
 * Wraps the fake adapter so one request type stalls until the test
 * releases it — the fake resolves immediately, which hides races
 * between an in-flight request and newer UI state.
 */
function createStallingAdapter(stalledType: ProtocolRequest["type"]): {
  adapter: ProtocolAdapter;
  release: () => void;
} {
  const inner = createFakeAdapter();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    adapter: {
      async handle(request): Promise<ProtocolResponse> {
        if (request.type !== stalledType) return inner.handle(request);
        // Capture the response at request time so releasing the gate
        // delivers a genuinely stale answer, not a fresh one.
        const response = await inner.handle(request);
        await gate;
        return response;
      },
    },
    release,
  };
}

function inputValue(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value;
}

/** Drafts one --primary edit so there is an edit set worth saving. */
async function draftPrimary(value: string) {
  fireEvent.change(await screen.findByLabelText("--primary value"), {
    target: { value },
  });
}

async function saveFit(name: string) {
  fireEvent.change(screen.getByLabelText("Fit name"), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Fit" }));
}

describe("the Fits lifecycle", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("saves the current edit set, lists it, and applies it back", async () => {
    render(<App adapter={createFakeAdapter()} />);
    await draftPrimary("green");
    await saveFit("moody");
    await screen.findByText("moody");

    // Drift away from the saved look, then apply it back.
    await draftPrimary("blue");
    fireEvent.click(screen.getByRole("button", { name: "Apply moody" }));

    await expect
      .poll(() =>
        (screen.getByLabelText("--primary value") as HTMLInputElement).value,
      )
      .toBe("green");
  });

  it("lists Fits saved before this session opened", async () => {
    const adapter = createFakeAdapter();
    await adapter.handle({
      type: "save-fit",
      name: "midnight",
      edits: { "--primary": { light: "navy" } },
    });

    render(<App adapter={adapter} />);

    await screen.findByText("midnight");
  });

  it("deleting a Fit removes it from the list", async () => {
    render(<App adapter={createFakeAdapter()} />);
    await draftPrimary("green");
    await saveFit("abandoned");
    await screen.findByText("abandoned");

    fireEvent.click(screen.getByRole("button", { name: "Delete abandoned" }));

    await expect.poll(() => screen.queryByText("abandoned")).toBeNull();
  });

  it("an invalid Fit name surfaces the adapter's error", async () => {
    render(<App adapter={createFakeAdapter()} />);
    await draftPrimary("green");
    await saveFit("../escape");

    expect((await screen.findByText(/not a valid fit name/)).textContent).toContain(
      "../escape",
    );
  });

  it("an applied Fit's spacing edits land in the spacing editor", async () => {
    const adapter = createFakeAdapter({
      document: {
        dialect: "shadcn",
        tokens: [
          { name: "--primary", value: { light: "black" } },
          { name: "--spacing-sm", value: { light: "1rem" } },
        ],
      },
    });
    await adapter.handle({
      type: "save-fit",
      name: "roomy",
      edits: { "--spacing-sm": { light: "2rem" } },
    });
    render(<App adapter={adapter} />);

    fireEvent.click(await screen.findByRole("button", { name: "Apply roomy" }));

    // The spacing input shows the applied value, not the source value.
    await expect.poll(() => inputValue("--spacing-sm value")).toBe("2rem");

    // A later spacing edit replaces the applied value instead of being
    // shadowed by it.
    fireEvent.change(screen.getByLabelText("--spacing-sm value"), {
      target: { value: "3rem" },
    });
    expect(inputValue("--spacing-sm value")).toBe("3rem");
  });

  it("a pending Apply disables Commit and keeps in-flight edits", async () => {
    const { adapter, release } = createStallingAdapter("apply-fit");
    render(<App adapter={adapter} />);
    await draftPrimary("green");
    await saveFit("moody");
    await screen.findByText("moody");
    await draftPrimary("blue");

    fireEvent.click(screen.getByRole("button", { name: "Apply moody" }));

    // Committing now would write the pre-apply drafts.
    expect(screen.getByRole("button", { name: /Commit/ })).toHaveProperty(
      "disabled",
      true,
    );

    // An edit typed while the request is in flight is newer than the
    // Fit; the response must not erase it.
    fireEvent.change(screen.getByLabelText("--background value"), {
      target: { value: "white" },
    });
    release();

    await expect.poll(() => inputValue("--primary value")).toBe("green");
    expect(inputValue("--background value")).toBe("white");
    await expect
      .poll(
        () =>
          (screen.getByRole("button", { name: /Commit/ }) as HTMLButtonElement)
            .disabled,
      )
      .toBe(false);
  });

  it("a list-fits failure surfaces the adapter's error", async () => {
    const inner = createFakeAdapter();
    const adapter: ProtocolAdapter = {
      async handle(request): Promise<ProtocolResponse> {
        if (request.type === "list-fits") {
          return { type: "error", message: "the fit store is unreadable" };
        }
        return inner.handle(request);
      },
    };
    render(<App adapter={adapter} />);

    await screen.findByText("the fit store is unreadable");
  });

  it("a slow initial list cannot overwrite a completed save", async () => {
    const { adapter, release } = createStallingAdapter("list-fits");
    render(<App adapter={adapter} />);
    await draftPrimary("green");
    await saveFit("moody");
    await screen.findByText("moody");

    // The stale list (empty: it was requested before the save) resolves
    // after the save completed; the saved Fit must stay listed. The
    // macrotask wait runs after the microtasks that deliver the stale
    // response, so the assertion sees its effect.
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText("moody")).not.toBeNull();
  });

  it("saving needs both a name and an edit set", async () => {
    render(<App adapter={createFakeAdapter()} />);
    await screen.findByLabelText("--primary value");
    const save = () => screen.getByRole("button", { name: "Save Fit" });

    // No edits yet: naming alone cannot save.
    fireEvent.change(screen.getByLabelText("Fit name"), {
      target: { value: "moody" },
    });
    expect(save()).toHaveProperty("disabled", true);

    await draftPrimary("green");
    expect(save()).toHaveProperty("disabled", false);
  });
});
