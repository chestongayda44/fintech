import type { StressPayload } from "../types";

export const PAYLOAD_URL = "/api/stress_payload.json";

export class PayloadError extends Error {
  constructor(
    message: string,
    readonly kind: "not_published" | "invalid",
    readonly source?: string,
  ) {
    super(message);
  }
}

/** Validate the parts of the contract the dashboard relies on. Throws PayloadError if unusable. */
export function parsePayload(raw: unknown): StressPayload {
  const p = raw as Partial<StressPayload> | null;
  if (!p || typeof p !== "object") throw new PayloadError("Payload is not a JSON object", "invalid");
  if (p.schema_version !== 2) {
    throw new PayloadError(`Expected schema_version 2, got ${String(p.schema_version)}`, "invalid");
  }
  const coef = p.model?.coefficients;
  if (!coef || typeof coef.chargeoff_lag1 !== "number" || typeof coef.unrate_chg4_lag1 !== "number") {
    throw new PayloadError("Model coefficients missing", "invalid");
  }
  if (!Array.isArray(p.unrate_history) || p.unrate_history.length < 5) {
    throw new PayloadError("unrate_history needs the last 5 quarters", "invalid");
  }
  if (!Array.isArray(p.history) || p.history.length === 0) {
    throw new PayloadError("History is empty", "invalid");
  }
  if (!p.last_observed || typeof p.last_observed.chargeoff !== "number") {
    throw new PayloadError("last_observed missing", "invalid");
  }
  return p as StressPayload;
}

export async function loadPayload(fetchImpl: typeof fetch = fetch): Promise<{ payload: StressPayload; source: string }> {
  const res = await fetchImpl(PAYLOAD_URL, { cache: "no-store" });
  const source = res.headers.get("X-Payload-Source") ?? "unknown";
  if (res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { source?: string };
    throw new PayloadError("No stress results have been published yet", "not_published", body.source);
  }
  if (!res.ok) throw new PayloadError(`Could not load stress results (HTTP ${res.status})`, "invalid");
  return { payload: parsePayload(await res.json()), source };
}
