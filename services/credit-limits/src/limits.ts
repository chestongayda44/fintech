const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL ?? "https://risk.internal.fintechco.example";

const lastKnown = new Map<string, number>();

/** Current credit limit for a customer, from the risk engine. */
export async function creditLimit(customerId: string): Promise<number> {
  try {
    const res = await fetch(`${RISK_ENGINE_URL}/limits/${customerId}`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`risk engine HTTP ${res.status}`);
    const { limitCents } = (await res.json()) as { limitCents: number };
    lastKnown.set(customerId, limitCents);
    return limitCents;
  } catch {
    return lastKnown.get(customerId) ?? 500_000;
  }
}
