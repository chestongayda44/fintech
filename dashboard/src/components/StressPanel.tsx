import { useId, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct, points, quarterLabel, quarterTick } from "../lib/format";
import { peakGap, project, type PeakGap } from "../lib/projection";
import type { StressPayload } from "../types";
import { axisProps, ChartTooltip, EndLabel, gridProps, Legend } from "./ChartParts";

const HISTORY_QUARTERS = 12;
const MAX_SHOCK = 5;

interface Row {
  date: string;
  history?: number | null;
  baseline?: number;
  stressed?: number;
}

export function headline(shockPp: number, peak: PeakGap, rampQuarters: number): string {
  const over = rampQuarters === 4 ? "over a year" : `over ${rampQuarters} quarters`;
  if (shockPp <= 0) {
    return `With no rise in unemployment, card charge-offs follow the no-shock path, reaching ${pct(peak.baseline)} by ${quarterLabel(peak.date)}.`;
  }
  return `A ${points(shockPp)} rise in unemployment ${over} lifts card charge-offs ${points(peak.gap, 2)} above the no-shock path at the peak, to ${pct(peak.stressed)} in ${quarterLabel(peak.date)}.`;
}

export function StressPanel({ payload }: { payload: StressPayload }) {
  const sliderId = useId();
  const [shock, setShock] = useState(payload.scenario_defaults.shock_pp);
  const ramp = payload.scenario_defaults.ramp_quarters;

  const baseline = useMemo(() => project(payload, 0), [payload]);
  const stressed = useMemo(() => project(payload, shock), [payload, shock]);
  const peak = peakGap(baseline, stressed);

  const last = payload.last_observed;
  const rows: Row[] = [
    ...payload.history
      .filter((r) => r.date <= last.date)
      .slice(-HISTORY_QUARTERS)
      .map((r) => ({ date: r.date, history: r.chargeoff })),
    ...baseline.map((b, i) => ({ date: b.date, baseline: b.chargeoff, stressed: stressed[i].chargeoff })),
  ];
  // Start both projected paths at the last observed quarter so the lines connect to history.
  const join = rows.find((r) => r.date === last.date);
  if (join) Object.assign(join, { baseline: last.chargeoff, stressed: last.chargeoff });
  const end = rows.length - 1;

  return (
    <section aria-labelledby="stress-h">
      <h2 id="stress-h">Stress scenarios</h2>
      <p className="stress-headline" aria-live="polite">{headline(shock, peak, ramp)}</p>

      <div className="stress-control">
        <label htmlFor={sliderId}>Unemployment rise, phased in over {ramp} quarters</label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={MAX_SHOCK}
          step={0.25}
          value={shock}
          onChange={(e) => setShock(Number(e.target.value))}
          aria-valuetext={`plus ${points(shock, 2)}`}
        />
        <output htmlFor={sliderId}>+{shock.toFixed(2)} pts</output>
      </div>

      <div className="chart-block">
        <p className="chart-title">Card charge-off rate: recent history and projections</p>
        <p className="chart-sub">Percent of card balances, quarterly</p>
        <Legend
          items={[
            { label: "Observed", color: "var(--chargeoff)" },
            { label: "No shock", color: "var(--chargeoff)", dashed: true },
            { label: "Stressed", color: "var(--shock)" },
          ]}
        />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 8, right: 132, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={quarterTick} minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={(v: number) => `${v}%`} domain={[0, "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
              content={<ChartTooltip names={{ history: "Observed", baseline: "No shock", stressed: "Stressed" }} />}
            />
            <Line type="linear" dataKey="history" stroke="var(--chargeoff)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line
              type="linear" dataKey="baseline" stroke="var(--chargeoff)" strokeWidth={2} strokeDasharray="5 4" dot={false}
              isAnimationActive={false}
              label={<EndLabel lastIndex={end} text={`No shock ${pct(rows[end]?.baseline)}`} color="var(--chargeoff)" dy={10} />}
            />
            <Line
              type="linear" dataKey="stressed" stroke="var(--shock)" strokeWidth={2.5} dot={false}
              activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }} isAnimationActive={false}
              label={<EndLabel lastIndex={end} text={`Stressed ${pct(rows[end]?.stressed)}`} color="var(--shock)" dy={-10} />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="section-note">
        Illustrative, not a forecast. Even with no shock the model drifts toward its long-run average, so read the
        gap between the two paths, not the level.
      </p>
    </section>
  );
}
