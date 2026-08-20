// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
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
  await screen.findByText(name);
}

/**
 * The light-bucket edits the lab pushes into one Preview iframe. The
 * push is forced by toggling the scheme twice (there and back), so the
 * spy sees a fresh message without the test depending on mount timing.
 */
function pushedEdits(title: string): Record<string, string> {
  const iframe = screen.getByTitle(title) as HTMLIFrameElement;
  const spy = vi.spyOn(iframe.contentWindow!, "postMessage");
  const toggle = screen.getByRole("button", { name: "Preview color scheme" });
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  const message = spy.mock.calls.at(-1)?.[0] as {
    edits: Record<string, string>;
  };
  spy.mockRestore();
  return message.edits;
}

describe("Compare", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("selecting two Fits renders dual Previews, each with its Fit applied", async () => {
    const adapter = createFakeAdapter();
    await adapter.handle({
      type: "save-fit",
      name: "midnight",
      edits: { "--primary": { light: "navy" } },
    });
    await adapter.handle({
      type: "save-fit",
      name: "sunrise",
      edits: { "--primary": { light: "coral" } },
    });
    render(<App adapter={adapter} />);
    await screen.findByText("midnight");

    fireEvent.click(screen.getByRole("button", { name: "Compare midnight" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare sunrise" }));

    expect(screen.queryByTitle("Preview")).toBeNull();
    expect(pushedEdits("Preview midnight")["--primary"]).toBe("navy");
    expect(pushedEdits("Preview sunrise")["--primary"]).toBe("coral");
  });

  it("leaving compare restores the prior editing state", async () => {
    render(<App adapter={createFakeAdapter()} />);
    await draftPrimary("green");
    await saveFit("moody");
    await saveFit("sunny");
    await draftPrimary("blue");

    fireEvent.click(screen.getByRole("button", { name: "Compare moody" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare sunny" }));
    expect(screen.queryByTitle("Preview")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Exit compare" }));

    // The single Preview is back and the draft survived untouched.
    expect(screen.getByTitle("Preview")).not.toBeNull();
    expect(pushedEdits("Preview")["--primary"]).toBe("blue");
    expect(
      (screen.getByLabelText("--primary value") as HTMLInputElement).value,
    ).toBe("blue");
  });

  it("compares an unsaved draft against a saved Fit", async () => {
    render(<App adapter={createFakeAdapter()} />);
    await draftPrimary("green");
    await saveFit("moody");
    await draftPrimary("blue");

    fireEvent.click(screen.getByRole("button", { name: "Compare moody" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Compare unsaved draft" }),
    );

    expect(pushedEdits("Preview moody")["--primary"]).toBe("green");
    expect(pushedEdits("Preview unsaved draft")["--primary"]).toBe("blue");
  });

  it("unselecting a side leaves compare", async () => {
    render(<App adapter={createFakeAdapter()} />);
    await draftPrimary("green");
    await saveFit("moody");

    const moody = () => screen.getByRole("button", { name: "Compare moody" });
    fireEvent.click(moody());
    fireEvent.click(
      screen.getByRole("button", { name: "Compare unsaved draft" }),
    );
    expect(screen.queryByTitle("Preview")).toBeNull();

    fireEvent.click(moody());

    expect(screen.getByTitle("Preview")).not.toBeNull();
  });

  it("deleting a compared Fit leaves compare", async () => {
    render(<App adapter={createFakeAdapter()} />);
    await draftPrimary("green");
    await saveFit("moody");
    await saveFit("sunny");

    fireEvent.click(screen.getByRole("button", { name: "Compare moody" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare sunny" }));
    expect(screen.queryByTitle("Preview")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete moody" }));

    await expect.poll(() => screen.queryByTitle("Preview")).not.toBeNull();
  });

  it("a third side cannot join a full compare", async () => {
    render(<App adapter={createFakeAdapter()} />);
    await draftPrimary("green");
    await saveFit("moody");
    await saveFit("sunny");

    fireEvent.click(screen.getByRole("button", { name: "Compare moody" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare sunny" }));

    expect(
      screen.getByRole("button", { name: "Compare unsaved draft" }),
    ).toHaveProperty("disabled", true);
  });
});
