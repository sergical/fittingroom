import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dev, type DevServer } from "astro";
import type { Plugin } from "vite";
import type { ProtocolResponse } from "@fittingroom/core";
import { fittingroomAstro } from "../src/astro.js";

/**
 * The fixture lives in the repo (not a temp dir) so Astro's own runtime
 * modules resolve through the monorepo's node_modules during dev SSR.
 */
const fixtureRoot = fileURLToPath(new URL("./fixtures/astro-app/", import.meta.url));

/** Drives the `astro:config:setup` hook and records what it configures. */
function runConfigSetup(command: "dev" | "build") {
  const plugins: Plugin[] = [];
  const scripts: { stage: string; content: string }[] = [];
  fittingroomAstro().hooks["astro:config:setup"]({
    command,
    updateConfig: (config) => {
      const vite = (config as { vite?: { plugins?: Plugin[] } }).vite;
      plugins.push(...(vite?.plugins ?? []));
    },
    injectScript: (stage, content) => {
      scripts.push({ stage, content });
    },
  });
  return { plugins, scripts };
}

describe("fittingroomAstro integration", () => {
  it("adds the fittingroom Vite plugin through the config hook in dev", () => {
    const { plugins } = runConfigSetup("dev");
    expect(plugins.map((plugin) => plugin.name)).toEqual(["fittingroom"]);
  });

  it("injects the preview client into every page in dev", () => {
    const { scripts } = runConfigSetup("dev");
    expect(scripts).toEqual([
      { stage: "head-inline", content: 'import("/__fittingroom/preview-client.js");' },
    ]);
  });

  it("configures nothing for builds", () => {
    const { plugins, scripts } = runConfigSetup("build");
    expect(plugins).toEqual([]);
    expect(scripts).toEqual([]);
  });
});

describe("fittingroom on an Astro dev server", () => {
  let server: DevServer;
  let baseUrl: string;
  const cssPath = join(fixtureRoot, "src", "styles", "global.css");
  const originalCss = readFileSync(cssPath, "utf8");

  const protocol = (request: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}/__fittingroom/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(request),
    });

  beforeAll(async () => {
    process.env.ASTRO_TELEMETRY_DISABLED = "1";
    // Astro sees vitest's VITEST env var and boots in its test mode,
    // which skips the page-serving middleware. Hide it while booting so
    // this server behaves like a real `astro dev`.
    const vitestEnv = process.env.VITEST;
    delete process.env.VITEST;
    try {
      server = await dev({
        root: fixtureRoot,
        logLevel: "silent",
        integrations: [fittingroomAstro()],
        server: { host: "127.0.0.1", port: 0 },
      });
    } finally {
      process.env.VITEST = vitestEnv;
    }
    const { address, port } = server.address;
    baseUrl = `http://${address}:${port}`;
  }, 60_000);

  afterAll(async () => {
    await server?.stop();
    writeFileSync(cssPath, originalCss);
  });

  it("serves the lab UI at the route", async () => {
    const response = await fetch(`${baseUrl}/__fittingroom/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('<div id="root">');
  });

  it("reads the app's tokens over the protocol", async () => {
    const response = await protocol({ type: "read" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as ProtocolResponse;
    expect(body.type).toBe("document");
    if (body.type !== "document") return;
    expect(body.document?.dialect).toBe("shadcn");
    expect(body.document?.tokens).toContainEqual({
      name: "--primary",
      value: { light: "oklch(0.205 0 0)", dark: "oklch(0.922 0 0)" },
    });
  });

  it("injects the preview client into the app's pages", async () => {
    const html = await (await fetch(`${baseUrl}/`)).text();
    expect(html).toContain("/__fittingroom/preview-client.js");

    const script = await fetch(`${baseUrl}/__fittingroom/preview-client.js`);
    expect(script.status).toBe(200);
    expect(await script.text()).toContain("fittingroom:preview");
  });

  it("commits an edit as a minimal value-only change to the source CSS", async () => {
    const response = await protocol(
      { type: "commit", edits: { "--primary": "oklch(0.3 0 0)" } },
      { Origin: baseUrl },
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as ProtocolResponse).type).toBe("committed");
    expect(readFileSync(cssPath, "utf8")).toBe(
      originalCss.replace("--primary: oklch(0.205 0 0);", "--primary: oklch(0.3 0 0);"),
    );
  });
});
