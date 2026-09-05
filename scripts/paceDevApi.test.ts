// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { paceDevApi } from "./paceDevApi";

let server: ViteDevServer | undefined;

afterEach(async () => {
  await server?.close();
  vi.unstubAllEnvs();
});

describe("PACE development API", () => {
  it("runs the real handler and preserves its authentication boundary", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    server = await createServer({
      configFile: false,
      plugins: [paceDevApi()],
      optimizeDeps: { noDiscovery: true, entries: [] },
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/pace/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Hoe werkt PACE?" }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "AUTH_REQUIRED" });

    const streamed = await fetch(`http://127.0.0.1:${address.port}/api/pace/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson", "X-Pace-Progress-Version": "1" },
      body: JSON.stringify({ question: "Hoe werkt PACE?" }),
    });
    expect(streamed.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await streamed.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({ type: "error", status: 401, payload: { error: "AUTH_REQUIRED" } });

    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const unconfigured = await fetch(`http://127.0.0.1:${address.port}/api/pace/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json()).toMatchObject({ error: "PACE_AI_NOT_CONFIGURED" });
  });
});