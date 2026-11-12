/// <reference types="vitest/config" />
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const run = promisify(execFile);
const PAYLOAD = "stress_payload.json";

/** Where the published stress payload lives, mirroring risk_model.storage (DATA_SOURCE=gcs|local). */
export function payloadLocation(env: NodeJS.ProcessEnv = process.env): { kind: "gcs" | "local"; where: string } {
  if ((env.DATA_SOURCE ?? "local").toLowerCase() === "gcs" && env.GCS_BUCKET) {
    const prefix = (env.GCS_PREFIX ?? "macro-credit-risk").replace(/^\/+|\/+$/g, "");
    return { kind: "gcs", where: `gs://${env.GCS_BUCKET}/${prefix}/${PAYLOAD}` };
  }
  return { kind: "local", where: resolve(__dirname, "..", "data", "published", PAYLOAD) };
}

/**
 * Serves the payload the data science pipeline published at /api/stress_payload.json.
 * Same source of truth as the Python side: a GCS bucket in the demo, local disk as fallback.
 */
function stressPayload(): Plugin {
  return {
    name: "fintechco-stress-payload",
    configureServer(server) {
      server.middlewares.use("/api/stress_payload.json", async (_req, res) => {
        const loc = payloadLocation();
        try {
          const body =
            loc.kind === "gcs"
              ? (await run("gcloud", ["storage", "cat", loc.where], { maxBuffer: 20 * 1024 * 1024, timeout: 12_000 })).stdout
              : await readFile(loc.where, "utf8");
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Payload-Source", loc.where);
          res.setHeader("Cache-Control", "no-store");
          res.end(body);
        } catch (err) {
          // Distinguish "nothing published there yet" from "couldn't read it" (auth, missing bucket, no gcloud).
          const e = err as { stderr?: string; killed?: boolean; message?: string };
          const detail = e.killed
            ? "Timed out after 12s reading from GCS (check network and `gcloud auth login`)."
            : String(e.stderr || e.message || err).trim();
          const missing = /ENOENT|No URLs matched|not found|404/i.test(detail) && !/bucket does not exist/i.test(detail);
          res.statusCode = missing ? 404 : 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: missing ? "not_published" : "unreadable", source: loc.where, detail: detail.slice(0, 400) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), stressPayload()],
  server: { port: 5173, open: false },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
