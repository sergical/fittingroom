// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createFakeAdapter } from "@fittingroom/core";
import App from "../src/App.js";

// The renderer's real chunk (@pierre/diffs + Shiki) is a browser
// concern; here the surface only needs a component that shows the
// patch, exactly like the pre-load fallback does.
vi.mock("../src/refusal-diff.js", () => ({
  default: ({ patch }: { patch: string }) => <pre>{patch}</pre>,
}));

const refusal = {
  reason: "tokens.css cannot be parsed: Unclosed block",
  diff: [
    "Index: tokens.css",
    "===================================================================",
    "--- tokens.css",
    "+++ tokens.css",
    "@@ -1,4 +1,4 @@",
    " :root {",
    "-  --primary: oklch(0.205 0 0);",
    "+  --primary: green;",
    " }",
    "",
  ].join("\n"),
};

/** Drafts one edit and commits it, so the fake adapter's refusal fires. */
async function commitEdit(adapter = createFakeAdapter({ refusal })) {
  render(<App adapter={adapter} />);
  fireEvent.change(await screen.findByLabelText("--primary value"), {
    target: { value: "green" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Commit/ }));
  return screen.findByLabelText("Refused write");
}

describe("the refused-write surface", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("a refused commit shows the reason and the diff", async () => {
    const surface = await commitEdit();

    expect(surface.textContent).toContain(refusal.reason);
    expect(surface.textContent).toContain("-  --primary: oklch(0.205 0 0);");
    expect(surface.textContent).toContain("+  --primary: green;");
    // The refused edit stays a draft, ready to copy or retry.
    expect(screen.getByLabelText("--primary value")).toHaveProperty(
      "value",
      "green",
    );
  });

  it("the copy action puts the patch on the clipboard", async () => {
    const surface = await commitEdit();

    fireEvent.click(screen.getByRole("button", { name: "Copy patch" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(refusal.diff);
    expect(surface).toBeTruthy();
  });

  it("a diff-less refusal shows the reason without a copy action", async () => {
    const surface = await commitEdit(
      createFakeAdapter({ refusal: { reason: "no known dialect", diff: "" } }),
    );

    expect(surface.textContent).toContain("no known dialect");
    expect(screen.queryByRole("button", { name: "Copy patch" })).toBeNull();
  });
});
