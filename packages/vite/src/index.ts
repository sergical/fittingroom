import type { Plugin } from "vite";

export interface FittingroomOptions {
  /** Where the laboratory UI is served. Defaults to "/__fittingroom". */
  route?: string;
}

const PLACEHOLDER_HTML = (route: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>fittingroom</title>
  </head>
  <body>
    <p>fittingroom — laboratory UI coming soon (${route}).</p>
  </body>
</html>
`;

/**
 * Serves the fittingroom laboratory UI at `/__fittingroom` (or `options.route`)
 * during `vite dev`. Dev-only: `apply: "serve"` keeps this out of
 * production builds entirely.
 *
 * SECURITY: this middleware is dev-only by design. Once it grows a
 * write endpoint (saving edits back to disk), it MUST check the request
 * origin before accepting any write — dev servers are reachable from
 * any page open in the developer's browser.
 */
export default function fittingroom(options: FittingroomOptions = {}): Plugin {
  const route = options.route ?? "/__fittingroom";

  return {
    name: "fittingroom",
    apply: "serve",
    configureServer(server) {
      // TODO: serve @fittingroom/ui's built dist assets instead of this
      // placeholder page.
      // TODO: open a WebSocket RPC channel for live token updates.
      // TODO: add a token extraction endpoint that runs @fittingroom/core's
      // parsers against the host app's CSS.
      server.middlewares.use(route, (req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end(PLACEHOLDER_HTML(route));
      });
    },
  };
}
