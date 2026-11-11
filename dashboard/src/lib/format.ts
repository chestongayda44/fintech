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

/** Compound adjective: 2 -> "2.0-point", 3.5 -> "3.5-point", 2.25 -> "2.25-point". */
export function pointRise(value: number): string {
  const n = Number.isInteger(value) ? value.toFixed(1) : String(Number(value.toFixed(2)));
  return `${n}-point`;
}
