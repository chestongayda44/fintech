const PARTNER_URL = process.env.REWARDS_PARTNER_URL!;

export async function redeem(customerId: string, points: number): Promise<string> {
  const res = await fetch(`${PARTNER_URL}/redemptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.REWARDS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, points }),
  });
  if (!res.ok) throw new Error(`rewards partner HTTP ${res.status}`);
  return ((await res.json()) as { redemptionId: string }).redemptionId;
}
