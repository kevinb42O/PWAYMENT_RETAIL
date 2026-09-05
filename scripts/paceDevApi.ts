import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { loadEnv, type Plugin } from "vite";

export const paceDevApi = (): Plugin => ({
  name: "pace-dev-api",
  apply: "serve",
  configureServer(server) {
    const environment = loadEnv(server.config.mode, server.config.envDir, ["GEMINI_", "OPENAI_", "SUPABASE_", "VITE_SUPABASE_", "PACE_"]);
    for (const [name, value] of Object.entries(environment)) {
      if (process.env[name] === undefined) process.env[name] = value;
    }
    server.middlewares.use(async (incoming, outgoing, next) => {
      const url = new URL(incoming.url ?? "/", "http://localhost");
      if (url.pathname !== "/api/pace/respond") return next();
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of incoming) {
          const buffer = Buffer.from(chunk);
          size += buffer.length;
          if (size > 40_000) {
            outgoing.writeHead(413, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            outgoing.end(JSON.stringify({ error: "PAYLOAD_TOO_LARGE" }));
            return;
          }
          chunks.push(buffer);
        }
        const handler = await server.ssrLoadModule("/api/pace/respond.ts");
        const response: Response = await handler.default.fetch(new Request(url, {
          method: incoming.method,
          headers,
          ...(incoming.method !== "GET" && incoming.method !== "HEAD" ? { body: Buffer.concat(chunks) } : {}),
        }));
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) {
          await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), outgoing);
        } else {
          outgoing.end();
        }
      } catch {
        if (outgoing.headersSent) {
          outgoing.destroy();
          return;
        }
        outgoing.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        outgoing.end(JSON.stringify({ error: "PACE_DEV_API_ERROR" }));
      }
    });
  },
});