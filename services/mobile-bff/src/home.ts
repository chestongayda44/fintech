const ACCOUNTS_URL = process.env.ACCOUNTS_URL!;
const LIMITS_URL = process.env.LIMITS_URL!;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function homeScreen(customerId: string) {
  const [account, limits] = await Promise.all([
    getJson<{ balanceCents: number }>(`${ACCOUNTS_URL}/accounts/${customerId}`),
    getJson<{ availableCents: number }>(`${LIMITS_URL}/limits/${customerId}`),
  ]);
  return { balanceCents: account.balanceCents, availableCents: limits.availableCents };
}
