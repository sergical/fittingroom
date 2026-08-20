// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createFakeAdapter } from "@fittingroom/core";
import App from "../src/App.js";

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
