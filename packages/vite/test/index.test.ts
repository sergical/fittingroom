import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import type { ProtocolResponse } from "@fittingroom/core";
import fittingroom from "../src/index.js";

const APP_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>fixture app</title></head>
  <body><h1>fixture app</h1></body>
</html>
`;

const APP_CSS = `:root {
  --background: #ffffff;
  --primary: #4f46e5;
  --radius: 0.5rem;
}

.dark {
  --background: #1c1917;
  --primary: #818cf8;
}
`;

/** Boots a real Vite dev server over a temp fixture app with the plugin installed. */
async function bootFixtureApp() {
  const root = mkdtempSync(join(tmpdir(), "fittingroom-vite-"));
  writeFileSync(join(root, "index.html"), APP_HTML);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "styles.css"), APP_CSS);

  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [fittingroom()],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const { port } = server.httpServer!.address() as AddressInfo;
  return { root, server, baseUrl: `http://127.0.0.1:${port}` };
}

describe("fittingroom plugin", () => {
  it("has the expected plugin name", () => {
    expect(fittingroom().name).toBe("fittingroom");
  });

  it("registers only in dev serve mode", () => {
    expect(fittingroom().apply).toBe("serve");
  });
});

describe("fittingroom dev server", () => {
  let root: string;
  let server: ViteDevServer;
  let baseUrl: string;
  const cssPath = () => join(root, "src", "styles.css");

  const protocol = (request: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}/__fittingroom/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(request),
    });

  beforeAll(async () => {
    ({ root, server, baseUrl } = await bootFixtureApp());
  });

  afterAll(async () => {
    await server.close();
  });

  it("serves the lab UI at the route", async () => {
    const response = await fetch(`${baseUrl}/__fittingroom/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain('<div id="root">');
  });

  it("redirects the bare route to the trailing-slash form", async () => {
    const response = await fetch(`${baseUrl}/__fittingroom`, {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/__fittingroom/");
  });

  it("answers a protocol read with the app's TokenDocument", async () => {
    const response = await protocol({ type: "read" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as ProtocolResponse;
    expect(body.type).toBe("document");
    if (body.type !== "document") return;
    expect(body.document?.dialect).toBe("shadcn");
    expect(body.document?.tokens).toContainEqual({
      name: "--primary",
      value: { light: "#4f46e5", dark: "#818cf8" },
    });
  });

  it("commits an edit as a minimal value-only change to the source CSS", async () => {
    const before = readFileSync(cssPath(), "utf8");
    const response = await protocol(
      { type: "commit", edits: { "--primary": "#ff0000" } },
      { Origin: baseUrl },
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as ProtocolResponse).type).toBe("committed");
    expect(readFileSync(cssPath(), "utf8")).toBe(
      before.replace("--primary: #4f46e5;", "--primary: #ff0000;"),
    );
  });

  it("rejects a cross-origin protocol request without touching the file", async () => {
    const before = readFileSync(cssPath(), "utf8");
    const response = await protocol(
      { type: "commit", edits: { "--primary": "#00ff00" } },
      { Origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
    expect(readFileSync(cssPath(), "utf8")).toBe(before);
  });

  it("rejects malformed protocol bodies", async () => {
    const response = await fetch(`${baseUrl}/__fittingroom/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(response.status).toBe(400);
  });

  it("injects the preview client into the host app's pages", async () => {
    const html = await (await fetch(`${baseUrl}/`)).text();
    expect(html).toContain("/__fittingroom/preview-client.js");

    const script = await fetch(`${baseUrl}/__fittingroom/preview-client.js`);
    expect(script.status).toBe(200);
    expect(await script.text()).toContain("fittingroom:preview");
  });
});
