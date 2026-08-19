// The single end-to-end loop from the v1 spec: open the room, edit a
// color, observe the live Preview change, commit, assert the file diff.
// It proves composition, not behaviors — those are tested at the seams.
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
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
  const previewPrimary = () => {
    const frame = page.frames().find((f) => f !== page.mainFrame());
    return frame
      ? frame.evaluate(() =>
          document.documentElement.style.getPropertyValue("--primary"),
        )
      : "";
  };
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
