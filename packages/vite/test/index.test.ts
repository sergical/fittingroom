import { describe, expect, it } from "vitest";
import type { ViteDevServer } from "vite";
import fittingroom from "../src/index.js";

/** Captures the middleware registered by configureServer without booting a real dev server. */
function createMockServer() {
  const middlewares: Array<{ route: string; handler: (req: unknown, res: unknown) => void }> = [];
  const server = {
    middlewares: {
      use(route: string, handler: (req: unknown, res: unknown) => void) {
        middlewares.push({ route, handler });
      },
    },
  } as unknown as ViteDevServer;
  return { server, middlewares };
}

function createMockResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = "";
  return {
    res: {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      end(chunk: string) {
        body = chunk;
      },
      get statusCode() {
        return statusCode;
      },
      set statusCode(value: number) {
        statusCode = value;
      },
    },
    headers,
    getBody: () => body,
    getStatus: () => statusCode,
  };
}

describe("fittingroom", () => {
  it("has the expected plugin name", () => {
    const plugin = fittingroom();
    expect(plugin.name).toBe("fittingroom");
  });

  it("responds 200 with HTML at /__fittingroom", () => {
    const plugin = fittingroom();
    const { server, middlewares } = createMockServer();

    const configureServer = plugin.configureServer as (server: ViteDevServer) => void;
    configureServer(server);

    expect(middlewares).toHaveLength(1);
    expect(middlewares[0]!.route).toBe("/__fittingroom");

    const { res, headers, getBody, getStatus } = createMockResponse();
    middlewares[0]!.handler({}, res);

    expect(getStatus()).toBe(200);
    expect(headers["Content-Type"]).toBe("text/html");
    expect(getBody()).toContain("fittingroom");
  });

  it("respects a custom route option", () => {
    const plugin = fittingroom({ route: "/custom-lab" });
    const { server, middlewares } = createMockServer();

    const configureServer = plugin.configureServer as (server: ViteDevServer) => void;
    configureServer(server);

    expect(middlewares[0]!.route).toBe("/custom-lab");
  });
});
