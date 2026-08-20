// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import App from "../src/App.js";
import { createDemoAdapter } from "../demo/adapter.js";
import { demoDocument, sampleCss } from "../demo/sample.js";
import { installPreviewClient } from "../demo/preview-client.js";

afterEach(cleanup);

describe("the demo adapter", () => {
  it("serves the sample document", async () => {
    const adapter = createDemoAdapter();
    const response = await adapter.handle({ type: "read" });
    expect(response).toEqual({ type: "document", document: demoDocument });
  });

  it("refuses every commit with the patch a real install would write", async () => {
    const adapter = createDemoAdapter();
    const response = await adapter.handle({
      type: "commit",
      edits: { "--primary": { light: "oklch(0.6 0.2 30)" } },
    });
    expect(response.type).toBe("refused");
    if (response.type !== "refused") return;
    expect(response.reason).toContain("demo");
    expect(response.diff).toContain("-  --primary: oklch(0.205 0 0);");
    expect(response.diff).toContain("+  --primary: oklch(0.6 0.2 30);");
  });

  it("leaves the document untouched by a commit", async () => {
    const adapter = createDemoAdapter();
    await adapter.handle({
      type: "commit",
      edits: { "--radius": "1rem" },
    });
    const read = await adapter.handle({ type: "read" });
    expect(read).toEqual({ type: "document", document: demoDocument });
  });

  it("passes Fit messages through to the fake adapter", async () => {
    const adapter = createDemoAdapter();
    const saved = await adapter.handle({
      type: "save-fit",
      name: "warm",
      edits: { "--primary": { light: "oklch(0.6 0.2 30)" } },
    });
    expect(saved.type).toBe("fit-saved");
    const fits = await adapter.handle({ type: "list-fits" });
    expect(fits).toMatchObject({ type: "fits", fits: [{ name: "warm" }] });
  });
});

describe("the sample CSS", () => {
  it("declares every token in :root and only dark halves in .dark", () => {
    const css = sampleCss(demoDocument);
    for (const token of demoDocument.tokens) {
      expect(css).toContain(`${token.name}:`);
    }
    const dark = css.slice(css.indexOf(".dark {"));
    expect(dark).toContain("--background: oklch(0.145 0 0);");
    expect(dark).not.toContain("--radius:");
  });
});

describe("the demo preview client", () => {
  it("applies preview overrides and the scheme class from a same-origin message", () => {
    installPreviewClient();
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "fittingroom:preview",
          edits: { "--primary": "red" },
          darkEdits: { "--primary": "blue" },
          scheme: "dark",
          fonts: [],
        },
      }),
    );
    const sheet = document.getElementById(
      "fittingroom-preview",
    ) as HTMLStyleElement;
    const rules = [...sheet.sheet!.cssRules] as CSSStyleRule[];
    expect(rules[0].style.getPropertyValue("--primary")).toBe("red");
    expect(rules[1].style.getPropertyValue("--primary")).toBe("blue");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("the lab UI in the demo", () => {
  it("points the Preview iframe at the demo's sample page", async () => {
    render(<App adapter={createDemoAdapter()} previewSrc="./preview.html" />);
    await screen.findByText("--primary");
    expect(screen.getByTitle("Preview").getAttribute("src")).toBe(
      "./preview.html",
    );
  });
});
