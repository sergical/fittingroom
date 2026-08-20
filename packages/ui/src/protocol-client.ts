import type {
  ProtocolAdapter,
  ProtocolRequest,
  ProtocolResponse,
} from "@fittingroom/core";

/**
 * Sends one Protocol request to the plugin's endpoint. The URL is
 * relative so the client follows the lab UI wherever the plugin's
 * `route` option serves it.
 */
export async function sendProtocolRequest(
  request: ProtocolRequest,
): Promise<ProtocolResponse> {
  const response = await fetch("api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    return { type: "error", message: `protocol request failed (${response.status})` };
  }
  return (await response.json()) as ProtocolResponse;
}

/**
 * The Protocol adapter the shipped UI talks through. Tests hand App the
 * in-memory fake adapter instead — the UI never knows the difference.
 */
export const httpAdapter: ProtocolAdapter = { handle: sendProtocolRequest };
