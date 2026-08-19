import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import {
  createTokenSource,
  createTokenSourceAdapter,
  type ProtocolAdapter,
  type ProtocolRequest,
  type ProtocolResponse,
} from "@fittingroom/core";

export interface FittingroomOptions {
  /** Where the laboratory UI is served. Defaults to "/__fittingroom". */
  route?: string;
  /**
   * The CSS file holding the app's tokens, relative to the Vite root.
   * When omitted, the plugin scans the root and `src/` for the first
   * CSS file in a known dialect.
   */
  cssFile?: string;
}

/**
 * Runs inside the host app's pages. Listens for same-origin preview
 * messages from the lab UI and applies them as inline CSS custom
 * property overrides on the document element — never touching files,
 * so losing a preview is always harmless.
 */
const PREVIEW_CLIENT = `(() => {
  const applied = new Set();
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== "fittingroom:preview" || typeof data.edits !== "object") return;
    const style = document.documentElement.style;
    for (const name of [...applied]) {
      if (!(name in data.edits)) {
        style.removeProperty(name);
        applied.delete(name);
      }
    }
    for (const [name, value] of Object.entries(data.edits)) {
      if (name.startsWith("--") && typeof value === "string") {
        style.setProperty(name, value);
        applied.add(name);
      }
    }
  });
})();
`;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/**
 * The lab UI's built assets ship inside this package's dist as `dist/ui`.
 * When running from source (this repo's tests), fall back to the sibling
 * dist produced by the package build.
 */
function resolveUiDist(): string | null {
  for (const candidate of ["ui/", "../dist/ui/"]) {
    const dir = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  return null;
}

/**
 * Finds the app's token CSS the same way TokenSource decides dialect:
 * by content, never by convention of location beyond "root or src/".
 * Candidates are sorted so detection is deterministic.
 */
function findTokenCssFile(root: string): string | null {
  const candidates: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".css")) {
      candidates.push(join(root, entry.name));
    }
  }
  const srcDir = join(root, "src");
  if (existsSync(srcDir)) {
    for (const entry of readdirSync(srcDir, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (entry.isFile() && entry.name.endsWith(".css")) {
        candidates.push(join(entry.parentPath, entry.name));
      }
    }
  }
  candidates.sort();
  return candidates.find((path) => createTokenSource(path).read() !== null) ?? null;
}

function send(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, body: ProtocolResponse): void {
  send(res, status, "application/json", JSON.stringify(body));
}

/**
 * SECURITY: dev servers are reachable from any page open in the
 * developer's browser, so a cross-origin page could otherwise drive the
 * write path. Every protocol request must carry no Origin (non-browser
 * tooling) or an Origin whose host matches the dev server's own.
 */
function isAllowedOrigin(req: Connect.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function readBody(req: Connect.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleProtocol(
  req: Connect.IncomingMessage,
  res: ServerResponse,
  adapter: ProtocolAdapter | null,
): Promise<void> {
  if (req.method !== "POST") {
    send(res, 405, "text/plain", "protocol requests must be POST");
    return;
  }
  if (!isAllowedOrigin(req)) {
    send(res, 403, "text/plain", "cross-origin protocol requests are refused");
    return;
  }
  let request: ProtocolRequest;
  try {
    request = JSON.parse(await readBody(req)) as ProtocolRequest;
  } catch {
    send(res, 400, "text/plain", "protocol requests must be JSON");
    return;
  }
  if (!adapter) {
    // No token CSS detected: reads answer with an empty document so the
    // UI can render its "no tokens" state; everything else is an error.
    if (request.type === "read") {
      sendJson(res, 200, { type: "document", document: null });
    } else {
      sendJson(res, 200, {
        type: "error",
        message: "no token CSS file detected in this app",
      });
    }
    return;
  }
  sendJson(res, 200, await adapter.handle(request));
}

function serveUiAsset(
  res: ServerResponse,
  uiDist: string | null,
  pathname: string,
): void {
  if (!uiDist) {
    send(res, 500, "text/plain", "fittingroom lab UI assets are missing from this build");
    return;
  }
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const file = join(uiDist, relative);
  // join() resolves any ".." segments; anything that escapes uiDist is refused.
  if (!file.startsWith(uiDist) || !existsSync(file) || !statSync(file).isFile()) {
    send(res, 404, "text/plain", "not found");
    return;
  }
  send(
    res,
    200,
    CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
    readFileSync(file),
  );
}

/**
 * Serves the fittingroom laboratory UI at `/__fittingroom` (or
 * `options.route`) during `vite dev`, answers protocol requests at
 * `<route>/api` against the app's own token CSS, and injects the
 * preview client into the host app's pages so the lab's iframe preview
 * can apply edits live. Dev-only: `apply: "serve"` keeps this out of
 * production builds entirely.
 */
export default function fittingroom(options: FittingroomOptions = {}): Plugin {
  const route = options.route ?? "/__fittingroom";

  return {
    name: "fittingroom",
    apply: "serve",

    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module", src: `${route}/preview-client.js` },
          injectTo: "head",
        },
      ];
    },

    configureServer(server) {
      const root = server.config.root;
      const cssFile = options.cssFile
        ? join(root, options.cssFile)
        : findTokenCssFile(root);
      const adapter: ProtocolAdapter | null = cssFile
        ? createTokenSourceAdapter({
            source: createTokenSource(cssFile),
            fitsDir: join(root, ".fittingroom"),
          })
        : null;
      const uiDist = resolveUiDist();

      server.middlewares.use(route, (req, res) => {
        void (async () => {
          const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

          if (pathname === "/api") {
            await handleProtocol(req, res, adapter);
            return;
          }
          if (req.method !== "GET" && req.method !== "HEAD") {
            send(res, 405, "text/plain", "method not allowed");
            return;
          }
          if (pathname === "/preview-client.js") {
            send(res, 200, "text/javascript", PREVIEW_CLIENT);
            return;
          }
          // The UI's assets are referenced relative to its page, so the
          // page must live at the trailing-slash URL.
          const original = req.originalUrl ?? "";
          if (pathname === "/" && !original.startsWith(`${route}/`)) {
            res.statusCode = 302;
            res.setHeader("Location", `${route}/`);
            res.end();
            return;
          }
          serveUiAsset(res, uiDist, pathname);
        })().catch(() => {
          if (!res.headersSent) send(res, 500, "text/plain", "internal error");
        });
      });
    },
  };
}
