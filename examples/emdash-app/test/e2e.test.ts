// The emdash end-to-end loop: the dialect is auto-detected from the CSS
// content alone, both halves of a light-dark() pair are edited through
// the Preview's scheme toggle, the live Preview follows, commit patches
// the theme override file per the emdash convention, and a write the
// source cannot round-trip is refused with a diff. It proves
// composition, not behaviors — those are tested at the seams.
import { appendFileSync, cpSync, mkdtempSync, readFileSync } from "node:fs";
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
  root = mkdtempSync(join(tmpdir(), "fittingroom-emdash-e2e-"));
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
 * light-scheme overrides, rule 1 the dark-scheme ones; an emdash pair
 * previews as one composed light-dark() value in both rules, letting
 * the previewed color-scheme pick the half.
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

it("detects emdash, edits both halves via the scheme toggle, and commits one pair", async () => {
  const themePath = join(root, "src", "theme.css");
  const stylesPath = join(root, "src", "styles.css");
  const originalTheme = readFileSync(themePath, "utf8");
  const originalStyles = readFileSync(stylesPath, "utf8");
  const brandValue = page.locator('input[aria-label="--color-brand value"]');
  const toggle = page.locator('button[aria-label="Preview color scheme"]');

  // Open: the dialect was detected from the CSS content alone — the
  // room lists the pair's light half with a color picker, with no
  // shadcn markers anywhere in the fixture.
  await page.goto(`${baseUrl}/__fittingroom`);
  await expect.poll(() => brandValue.inputValue()).toBe("#4f46e5");
  await expect
    .poll(() =>
      page.locator('input[aria-label="--color-brand picker"]').isVisible(),
    )
    .toBe(true);

  // Edit the light half: the preview composes the pair back into one
  // light-dark() value, with no file writes.
  await brandValue.fill("#ff0000");
  await expect
    .poll(() => previewRuleVar(0, "--color-brand"))
    .toBe("light-dark(#ff0000, #818cf8)");
  expect(readFileSync(themePath, "utf8")).toBe(originalTheme);

  // Toggle: the Preview flips to dark and the editor shows the dark half.
  await toggle.click();
  await expect.poll(() => brandValue.inputValue()).toBe("#818cf8");
  await brandValue.fill("#00ff00");
  await expect
    .poll(() => previewRuleVar(1, "--color-brand"))
    .toBe("light-dark(#ff0000, #00ff00)");

  // Toggle back: the light half kept its own draft.
  await toggle.click();
  await expect.poll(() => brandValue.inputValue()).toBe("#ff0000");

  // Commit: one declaration in the theme override file changes — the
  // merged light-dark() pair — and the component stylesheet is untouched.
  await page.locator("button.lab-commit").click();
  await expect
    .poll(() => readFileSync(themePath, "utf8"))
    .toBe(
      originalTheme.replace(
        "--color-brand: light-dark(#4f46e5, #818cf8);",
        "--color-brand: light-dark(#ff0000, #00ff00);",
      ),
    );
  expect(readFileSync(stylesPath, "utf8")).toBe(originalStyles);

  // The committed pair becomes the new base and the draft is gone.
  await expect.poll(() => brandValue.inputValue()).toBe("#ff0000");
  await expect.poll(() => previewRuleVar(0, "--color-brand")).toBe("");
});

// Round-trip refusal: a commit against a theme file the source can no
// longer parse is refused — surfaced with the reason and the declined
// diff — and nothing is written.
it("refuses to commit into a theme file it cannot round-trip", async () => {
  const themePath = join(root, "src", "theme.css");
  appendFileSync(themePath, "\n:root {\n");
  const corrupted = readFileSync(themePath, "utf8");

  await page.locator('input[aria-label="--color-brand value"]').fill("#123456");
  await page.locator("button.lab-commit").click();

  const surface = page.locator('[aria-label="Refused write"]');
  await expect
    .poll(() => surface.textContent())
    .toContain("cannot be parsed");
  await expect
    .poll(() => surface.locator("button", { hasText: "Copy patch" }).isVisible())
    .toBe(true);
  expect(readFileSync(themePath, "utf8")).toBe(corrupted);
});
