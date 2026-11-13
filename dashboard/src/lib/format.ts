/** "2026-04-01" -> "2026 Q2" */
export function quarterLabel(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${y} Q${Math.floor((m - 1) / 3) + 1}`;
}

/** "2026-04-01" -> "Q2 '26" (compact axis tick) */
export function quarterTick(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `Q${Math.floor((m - 1) / 3) + 1} '${String(y).slice(2)}`;
}

export function pct(value: number | null | undefined, digits = 2): string {
  return value == null || Number.isNaN(value) ? "n/a" : `${value.toFixed(digits)}%`;
}

export function points(value: number, digits = 1): string {
  return `${value.toFixed(digits)} ${Math.abs(value) === 1 ? "point" : "points"}`;
}

/** Quarter start of `date` plus `n` quarters: ("2026-10-01", 1) -> "2027-01-01" */
export function addQuarters(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const q = y * 4 + Math.floor((m - 1) / 3) + n;
  return `${Math.floor(q / 4)}-${String((q % 4) * 3 + 1).padStart(2, "0")}-01`;
}
