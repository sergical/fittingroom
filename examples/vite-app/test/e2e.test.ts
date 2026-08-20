// The end-to-end loops: open the room, edit (a color, then spacing via
// the density multiplier, then a shadow via presets and sliders, then
// a color's dark half behind the scheme toggle), observe the live
// Preview change, commit, assert the file diff. They prove
// composition, not behaviors — those are tested at the seams.
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, it } from "vitest";
import fittingroom from "fittingroom";

const appDir = fileURLToPath(new URL("..", import.meta.url));

let root: string;
let server: ViteDevServer;
let browser: Browser;
let page: Page;
let baseUrl: string;

beforeAll(async () => {
  // The commit step writes to the app's CSS, so the test runs against a
  // throwaway copy of this example app.
  root = mkdtempSync(join(tmpdir(), "fittingroom-e2e-"));
  cpSync(join(appDir, "index.html"), join(root, "index.html"));
  cpSync(join(appDir, "src"), join(root, "src"), { recursive: true });

  server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [fittingroom()],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const { port } = server.httpServer!.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  browser = await chromium.launch();
  page = await browser.newPage();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * The preview client applies drafts through its own injected stylesheet,
 * leaving inline styles and files untouched. Rule 0 holds the
 * light-scheme overrides, rule 1 the dark-scheme ones.
 */
const previewRuleVar = (index: number, name: string) => {
  const frame = page.frames().find((f) => f !== page.mainFrame());
  return frame
    ? frame.evaluate(
        ([ruleIndex, property]) => {
          const sheet = document.getElementById(
            "fittingroom-preview",
          ) as HTMLStyleElement | null;
          const rule = sheet?.sheet?.cssRules[ruleIndex as number];
          return rule instanceof CSSStyleRule
            ? rule.style.getPropertyValue(property as string)
            : "";
        },
        [index, name] as const,
      )
    : "";
};

const previewVar = (name: string) => previewRuleVar(0, name);

it("opens, edits, previews, reloads, commits, and changes the file", async () => {
  const cssPath = join(root, "src", "styles.css");
  const originalCss = readFileSync(cssPath, "utf8");

  // Open: the room lists the app's real color tokens.
  await page.goto(`${baseUrl}/__fittingroom`);
  const primaryValue = page.locator('input[aria-label="--primary value"]');
  await expect.poll(() => primaryValue.inputValue()).toBe("#4f46e5");
  await expect
    .poll(() => page.locator('input[aria-label="--primary picker"]').isVisible())
    .toBe(true);

  // Edit: the preview updates instantly, with no file writes.
  await primaryValue.fill("#ff0000");
  const previewPrimary = () => previewVar("--primary");
  await expect.poll(previewPrimary).toBe("#ff0000");
  expect(readFileSync(cssPath, "utf8")).toBe(originalCss);

  // Reload: the unsaved edit survives.
  await page.reload();
  await expect.poll(() => primaryValue.inputValue()).toBe("#ff0000");
  await expect.poll(previewPrimary).toBe("#ff0000");

  // Commit: a minimal value-only diff lands in the source CSS.
  await page.locator("button.lab-commit").click();
  await expect
    .poll(() => readFileSync(cssPath, "utf8"))
    .toBe(originalCss.replace("--primary: #4f46e5;", "--primary: #ff0000;"));

  // The committed value becomes the new base and the draft is gone.
  await expect.poll(() => primaryValue.inputValue()).toBe("#ff0000");
  await expect.poll(previewPrimary).toBe("");
});

// The spacing loop from issue #6: the density multiplier live-previews
// across all spacing tokens, per-token overrides compose with it, commit
// writes the computed values as ordinary edits, and reset restores the
// original values.
it("scales spacing by density, composes overrides, commits, and resets", async () => {
  const cssPath = join(root, "src", "styles.css");
  const originalCss = readFileSync(cssPath, "utf8");
  const density = page.locator('input[aria-label="Density multiplier value"]');

  // Multiplier: every spacing token previews scaled, with no file writes.
  await density.fill("2");
  await expect.poll(() => previewVar("--spacing-sm")).toBe("1.5rem");
  await expect.poll(() => previewVar("--spacing-md")).toBe("2.5rem");
  await expect.poll(() => previewVar("--spacing-lg")).toBe("4rem");
  expect(readFileSync(cssPath, "utf8")).toBe(originalCss);

  // Override: a per-token base composes with the multiplier.
  await page.locator('input[aria-label="--spacing-sm value"]').fill("1rem");
  await expect.poll(() => previewVar("--spacing-sm")).toBe("2rem");

  // Reset: original values come back.
  await page.locator('button[aria-label="Reset spacing"]').click();
  await expect.poll(() => density.inputValue()).toBe("1");
  await expect.poll(() => previewVar("--spacing-md")).toBe("");
  await expect
    .poll(() => page.locator('input[aria-label="--spacing-sm value"]').inputValue())
    .toBe("0.75rem");

  // Commit: the computed values land as ordinary value-only edits.
  await density.fill("2");
  await page.locator('input[aria-label="--spacing-sm value"]').fill("1rem");
  await page.locator("button.lab-commit").click();
  await expect
    .poll(() => readFileSync(cssPath, "utf8"))
    .toBe(
      originalCss
        .replace("--spacing-sm: 0.75rem;", "--spacing-sm: 2rem;")
        .replace("--spacing-md: 1.25rem;", "--spacing-md: 2.5rem;")
        .replace("--spacing-lg: 2rem;", "--spacing-lg: 4rem;"),
    );

  // The committed values are the new originals: the multiplier is back
  // at ×1 over them and the preview overrides are gone.
  await expect.poll(() => density.inputValue()).toBe("1");
  await expect.poll(() => previewVar("--spacing-md")).toBe("");
  await expect
    .poll(() => page.locator('input[aria-label="--spacing-md value"]').inputValue())
    .toBe("2.5rem");
});

// The shadow loop from issue #7: presets pick fast, decomposed sliders
// tune precisely, and the value that previews and commits is always one
// composed string.
it("picks a shadow preset, tunes it with the sliders, and commits one string", async () => {
  const cssPath = join(root, "src", "styles.css");
  const originalCss = readFileSync(cssPath, "utf8");

  // Presets tab: picking a preset previews its composed string.
  await page
    .locator('[aria-label="--shadow-md presets"] button', { hasText: "lg" })
    .click();
  await expect
    .poll(() => previewVar("--shadow-md"))
    .toBe("0 10px 15px -3px rgb(0 0 0 / 0.1)");
  expect(readFileSync(cssPath, "utf8")).toBe(originalCss);

  // Sliders tab: one decomposed part moves; the rest of the preset stays.
  await page.getByRole("tab", { name: "Sliders" }).click();
  await page.locator('input[aria-label="--shadow-md blur"]').fill("20");
  await expect
    .poll(() => previewVar("--shadow-md"))
    .toBe("0 10px 20px -3px rgb(0 0 0 / 0.1)");

  // Commit: the stored token value is the one composed string.
  await page.locator("button.lab-commit").click();
  await expect
    .poll(() => readFileSync(cssPath, "utf8"))
    .toBe(
      originalCss.replace(
        "--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);",
        "--shadow-md: 0 10px 20px -3px rgb(0 0 0 / 0.1);",
      ),
    );
  await expect.poll(() => previewVar("--shadow-md")).toBe("");
});

// The font loop from issue #8: picking a Google Font auditions it live
// in the Preview (the candidate stylesheet loads inside the iframe),
// commit writes only the variable value, and the import snippet is
// handed over with a copy action.
it("auditions a Google Font, commits only the value, and hands over the import", async () => {
  const cssPath = join(root, "src", "styles.css");
  const originalCss = readFileSync(cssPath, "utf8");

  // Pick: the preview shows the candidate value and loads its stylesheet.
  await page
    .locator('select[aria-label="--font-sans font"]')
    .selectOption("Inter");
  await expect.poll(() => previewVar("--font-sans")).toBe('"Inter", sans-serif');
  const auditionLink = () => {
    const frame = page.frames().find((f) => f !== page.mainFrame());
    return frame
      ? frame.evaluate(
          () =>
            document.querySelector<HTMLLinkElement>(
              'link[href^="https://fonts.googleapis.com/"]',
            )?.href ?? "",
        )
      : "";
  };
  await expect.poll(auditionLink).toContain("family=Inter");
  expect(readFileSync(cssPath, "utf8")).toBe(originalCss);

  // Commit: only the variable value changes in the file.
  await page.locator("button.lab-commit").click();
  await expect
    .poll(() => readFileSync(cssPath, "utf8"))
    .toBe(
      originalCss.replace(
        "--font-sans: system-ui, sans-serif;",
        '--font-sans: "Inter", sans-serif;',
      ),
    );

  // Handover: the import snippet appears with a copy action, and the
  // preview override is gone — loading the font is the developer's move.
  const handover = page.locator('[aria-label="Font import"]');
  await expect
    .poll(() => handover.locator("pre").textContent())
    .toContain("@import url('https://fonts.googleapis.com/css2?family=Inter");
  await expect
    .poll(() => handover.locator("button", { hasText: "Copy" }).isVisible())
    .toBe(true);
  await expect.poll(() => previewVar("--font-sans")).toBe("");
});

// The dark-mode loop from issue #9: edit what you see. The Preview's
// scheme toggle flips the iframe into dark mode, the editors show the
// dark halves, and an edit targets only the previewed scheme's half.
it("toggles the previewed scheme and edits the dark half independently", async () => {
  const cssPath = join(root, "src", "styles.css");
  const originalCss = readFileSync(cssPath, "utf8");
  const toggle = page.locator('button[aria-label="Preview color scheme"]');
  const primaryValue = page.locator('input[aria-label="--primary value"]');
  const iframeIsDark = () => {
    const frame = page.frames().find((f) => f !== page.mainFrame());
    return frame
      ? frame.evaluate(() => document.documentElement.classList.contains("dark"))
      : false;
  };

  // Toggle: the Preview enters dark mode and the editor shows the dark half.
  await toggle.click();
  await expect.poll(iframeIsDark).toBe(true);
  await expect.poll(() => primaryValue.inputValue()).toBe("#818cf8");

  // Edit: only the dark override rule changes, and no file is written.
  await primaryValue.fill("#00ff00");
  await expect.poll(() => previewRuleVar(1, "--primary")).toBe("#00ff00");
  await expect.poll(() => previewVar("--primary")).toBe("");
  expect(readFileSync(cssPath, "utf8")).toBe(originalCss);

  // Toggle back: the light half is untouched by the dark edit.
  await toggle.click();
  await expect.poll(iframeIsDark).toBe(false);
  await expect.poll(() => primaryValue.inputValue()).toBe("#ff0000");
  await toggle.click();
  await expect.poll(() => primaryValue.inputValue()).toBe("#00ff00");

  // Commit: only the .dark declaration changes in the file.
  await page.locator("button.lab-commit").click();
  await expect
    .poll(() => readFileSync(cssPath, "utf8"))
    .toBe(originalCss.replace("--primary: #818cf8;", "--primary: #00ff00;"));
  await expect.poll(() => primaryValue.inputValue()).toBe("#00ff00");
  await expect.poll(() => previewRuleVar(1, "--primary")).toBe("");
});

// The Fits loop from issue #12: save the current edit set as a named
// Fit, list it, apply it back, commit it through the ordinary write
// path, and delete it. The Fit lives as a human-readable file in the
// host repo's .fittingroom/ so looks travel with the branch.
it("saves, lists, applies, commits, and deletes a Fit", async () => {
  const cssPath = join(root, "src", "styles.css");
  const fitPath = join(root, ".fittingroom", "midnight.json");
  const primaryValue = page.locator('input[aria-label="--primary value"]');

  // A reload resets the previewed scheme to light and clears no drafts.
  await page.reload();
  const originalCss = readFileSync(cssPath, "utf8");

  // Save: the current edit set becomes a named Fit on disk.
  await primaryValue.fill("#0000ff");
  await page.locator('input[aria-label="Fit name"]').fill("midnight");
  await page.locator("button.lab-save-fit").click();
  await expect
    .poll(() => page.locator(".lab-fit", { hasText: "midnight" }).isVisible())
    .toBe(true);

  // The Fit file is human-readable, pretty-printed JSON — git-diff-friendly.
  await expect.poll(() => existsSync(fitPath)).toBe(true);
  expect(readFileSync(fitPath, "utf8")).toBe(
    `${JSON.stringify(
      { name: "midnight", edits: { "--primary": { light: "#0000ff" } } },
      null,
      2,
    )}\n`,
  );

  // Drift away, then apply: the editor and the Preview return to the Fit.
  await primaryValue.fill("#ff00ff");
  await expect.poll(() => previewVar("--primary")).toBe("#ff00ff");
  await page.locator('button[aria-label="Apply midnight"]').click();
  await expect.poll(() => primaryValue.inputValue()).toBe("#0000ff");
  await expect.poll(() => previewVar("--primary")).toBe("#0000ff");
  expect(readFileSync(cssPath, "utf8")).toBe(originalCss);

  // Commit: the applied Fit goes through the ordinary write path.
  await page.locator("button.lab-commit").click();
  await expect
    .poll(() => readFileSync(cssPath, "utf8"))
    .toBe(originalCss.replace("--primary: #ff0000;", "--primary: #0000ff;"));

  // Delete: the Fit leaves the disk and the list.
  await page.locator('button[aria-label="Delete midnight"]').click();
  await expect.poll(() => existsSync(fitPath)).toBe(false);
  await expect
    .poll(() => page.locator(".lab-fit", { hasText: "midnight" }).count())
    .toBe(0);
});
