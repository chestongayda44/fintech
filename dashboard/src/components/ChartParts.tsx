import type { ReactNode } from "react";
import { quarterLabel } from "../lib/format";

/** Shared axis/grid styling so every chart reads as one system. */
export const axisProps = {
  stroke: "var(--rule)",
  tick: { fill: "var(--ink-2)", fontSize: 12 },
  tickLine: false,
} as const;

export const gridProps = { stroke: "var(--grid)", vertical: false } as const;

export interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
  band?: boolean;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="legend">
      {items.map((it) => (
        <li key={it.label}>
          <span
            className={`swatch${it.dashed ? " dashed" : ""}${it.band ? " band" : ""}`}
            style={{ color: it.color }}
            aria-hidden
          />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string | null;
  color?: string;
}

/** Hover tooltip: quarter, then one row per visible series, values in ink, identity by swatch. */
export function ChartTooltip({
  active,
  label,
  payload,
  names,
}: {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  names: Record<string, string>;
}): ReactNode {
  if (!active || !payload?.length || label == null) return null;
  const rows = payload.filter((p) => p.value != null && names[String(p.dataKey)]);
  if (!rows.length) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-title">{quarterLabel(String(label))}</div>
      {rows.map((p) => (
        <div className="tooltip-row" key={String(p.dataKey)}>
          <span className="tooltip-key">
            <span className="swatch" style={{ color: p.color }} aria-hidden />
            {names[String(p.dataKey)]}
          </span>
          <b>{Number(p.value).toFixed(2)}%</b>
        </div>
      ))}
    </div>
  );
}

/** Direct label at the end of a line (selective: last point only). */
export function EndLabel({
  x,
  y,
  index,
  lastIndex,
  text,
  color,
  dy = 0,
}: {
  x?: number;
  y?: number;
  index?: number;
  lastIndex: number;
  text: string;
  color: string;
  dy?: number;
}) {
  if (index !== lastIndex || x == null || y == null) return null;
  return (
    <g>
      <circle cx={x} cy={y} r={4} fill={color} stroke="var(--paper)" strokeWidth={2} />
      <text x={x + 8} y={y + dy} dy="0.35em" fontSize={12} fill="var(--ink)" fontWeight={600}>
        {text}
      </text>
    </g>
  );
}
