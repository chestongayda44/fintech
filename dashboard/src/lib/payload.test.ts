import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/stress_payload.json";
import { quarterLabel, quarterTick } from "./format";
import { loadPayload, parsePayload, PayloadError } from "./payload";

describe("parsePayload", () => {
  it("accepts the payload the Python pipeline publishes", () => {
    const p = parsePayload(fixture);
    expect(p.model.target).toBe("chargeoff");
    expect(p.unrate_history).toHaveLength(5);
  });

  it("rejects an older schema version", () => {
    expect(() => parsePayload({ ...fixture, schema_version: 1 })).toThrow(PayloadError);
  });

  it("rejects a payload without coefficients", () => {
    expect(() => parsePayload({ ...fixture, model: { ...fixture.model, coefficients: {} } })).toThrow(/coefficients/);
  });
});

describe("loadPayload", () => {
  it("reports a not-yet-published payload distinctly", async () => {
    const fake = async () =>
      new Response(JSON.stringify({ error: "not_published", source: "gs://b/p/stress_payload.json" }), { status: 404 });
    await expect(loadPayload(fake as typeof fetch)).rejects.toMatchObject({
      kind: "not_published",
      source: "gs://b/p/stress_payload.json",
    });
  });

  it("returns the payload and where it came from", async () => {
    const fake = async () =>
      new Response(JSON.stringify(fixture), { status: 200, headers: { "X-Payload-Source": "data/published" } });
    const { payload, source } = await loadPayload(fake as typeof fetch);
    expect(source).toBe("data/published");
    expect(payload.last_observed.date).toBe(fixture.last_observed.date);
  });
});

describe("format", () => {
  it("labels quarters", () => {
    expect(quarterLabel("2026-04-01")).toBe("2026 Q2");
    expect(quarterTick("2027-10-01")).toBe("Q4 '27");
  });
});

describe("pointRise", () => {
  it("reads as a compound adjective", async () => {
    const { pointRise } = await import("./format");
    expect(pointRise(2)).toBe("2.0-point");
    expect(pointRise(2.25)).toBe("2.25-point");
    expect(pointRise(3.5)).toBe("3.5-point");
  });
});
