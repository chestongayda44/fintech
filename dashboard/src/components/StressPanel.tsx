import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct, points, quarterLabel, quarterTick } from "../lib/format";
import { longRunChargeoff, peakImpact, project } from "../lib/projection";
import type { StressPayload } from "../types";
import { axisProps, ChartTooltip, EndLabel, gridProps, Legend } from "./ChartParts";

const MAX_SHOCK = 5;
const HISTORY_QUARTERS = 12;

interface Point {
  date: string;
  history?: number | null;
  baseline?: number;
  stressed?: number;
}

export function StressPanel({ payload }: { payload: StressPayload }) {
  const [shock, setShock] = useState(payload.scenario_defaults.shock_pp);
  const last = payload.last_observed;
  const baseline = useMemo(() => project(payload, 0), [payload]);
  const stressed = useMemo(() => project(payload, shock), [payload, shock]);
  const peak = peakImpact(baseline, stressed);

  // Fixed axis (sized for the largest shock) so the chart doesn't rescale while sliding.
  const yMax = useMemo(() => {
    const worst = project(payload, MAX_SHOCK).map((r) => r.chargeoff);
    const hist = payload.history.slice(-HISTORY_QUARTERS).map((r) => r.chargeoff ?? 0);
    return Math.ceil(Math.max(...worst, ...hist) + 0.5);
  }, [payload]);

  const data: Point[] = [
    ...payload.history.slice(-HISTORY_QUARTERS).map((r) => ({ date: r.date, history: r.chargeoff })),
    ...baseline.map((r, i) => ({ date: r.date, baseline: r.chargeoff, stressed: stressed[i].chargeoff })),
  ];
  // Join projections to the last observed point.
  const anchor = data.find((d) => d.date === last.date);
  if (anchor) Object.assign(anchor, { baseline: last.chargeoff, stressed: last.chargeoff });
  const lastIndex = data.length - 1;

  const headline =
    shock === 0
      ? `With no unemployment shock, charge-offs drift toward the model's long-run level of ${pct(longRunChargeoff(payload))}.`
      : `A ${points(shock, 2)} rise in unemployment, phased in over a year, adds up to ${points(peak.gapPp, 2)} to card charge-offs by ${quarterLabel(peak.date)}, versus no shock.`;

  return (
    <section aria-labelledby="stress-h" className="stress">
      <h2 id="stress-h">Stress scenarios</h2>
      <div className="stress-control">
        <label htmlFor="shock">
          Unemployment rise, phased in over a year <output htmlFor="shock">+{points(shock, 2)}</output>
        </label>
        <input
          id="shock" type="range" min={0} max={MAX_SHOCK} step={0.25} value={shock}
          onChange={(e) => setShock(Number(e.target.value))}
        />
      </div>
      <p className="stress-headline" aria-live="polite">{headline}</p>

      <div className="chart-block">
        <p className="chart-title">Projected card charge-offs</p>
        <p className="chart-sub">Percent of card balances, next {baseline.length} quarters</p>
        <Legend
          items={[
            { label: "History", color: "var(--chargeoff)" },
            { label: "No shock", color: "var(--chargeoff)", dashed: true },
            { label: "Stressed", color: "var(--shock)" },
          ]}
        />
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 132, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={quarterTick} minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={(v: number) => `${v}%`} domain={[0, yMax]} />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
              content={<ChartTooltip names={{ history: "Charge-offs", baseline: "No shock", stressed: "Stressed" }} />}
            />
            <Line type="linear" dataKey="history" stroke="var(--chargeoff)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line
              type="linear" dataKey="baseline" stroke="var(--chargeoff)" strokeWidth={2} strokeDasharray="5 4"
              dot={false} isAnimationActive={false}
              label={<EndLabel lastIndex={lastIndex} text={`No shock ${pct(baseline.at(-1)?.chargeoff)}`} color="var(--chargeoff)" dy={10} />}
            />
            <Line
              type="linear" dataKey="stressed" stroke="var(--shock)" strokeWidth={2.5} dot={false} isAnimationActive={false}
              label={<EndLabel lastIndex={lastIndex} text={`Stressed ${pct(stressed.at(-1)?.chargeoff)}`} color="var(--shock)" dy={-10} />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="section-note">
        Illustrative scenario output, not a forecast. The model links losses to the past year's change in
        unemployment; correlation is not causation.
      </p>
    </section>
  );
}
