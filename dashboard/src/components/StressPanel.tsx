import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct, points, quarterLabel, quarterTick } from "../lib/format";
import { peakGap, project } from "../lib/projection";
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

export function StressPanel({ payload }: { payload: StressPayload }) {
  const { ramp_quarters: ramp, shock_pp: defaultShock } = payload.scenario_defaults;
  const [shock, setShock] = useState(defaultShock);

  const baseline = useMemo(() => project(payload, 0), [payload]);
  const stressed = useMemo(() => project(payload, shock), [payload, shock]);
  const peak = peakGap(baseline, stressed);

  const last = payload.last_observed;
  const rows: Row[] = [
    ...payload.history.slice(-HISTORY_QUARTERS).map((r) => ({ date: r.date, history: r.chargeoff })),
  ];
  // Join both projections to the last observed point so the lines connect.
  const join = rows.find((r) => r.date === last.date);
  if (join) Object.assign(join, { baseline: last.chargeoff, stressed: last.chargeoff });
  baseline.forEach((b, i) => rows.push({ date: b.date, baseline: b.chargeoff, stressed: stressed[i].chargeoff }));
  const lastIndex = rows.length - 1;

  const headline =
    shock === 0
      ? `With no shock, the model has charge-offs drifting to ${pct(baseline[baseline.length - 1].chargeoff)} by ${quarterLabel(baseline[baseline.length - 1].date)}; move the slider to stress them.`
      : `A ${points(shock, 2)} rise in unemployment adds up to ${points(peak.gap, 2)} to card charge-offs versus no shock, peaking in ${quarterLabel(peak.date)} at ${pct(peak.chargeoff)}.`;

  return (
    <section aria-labelledby="stress-h">
      <h2 id="stress-h">Stress scenarios</h2>
      <div className="stress-control">
        <label htmlFor="shock">
          Unemployment rise, phased in over {ramp} quarters: <strong className="is-shock">+{shock.toFixed(2)} pts</strong>
        </label>
        <input
          id="shock"
          type="range"
          min={0}
          max={MAX_SHOCK}
          step={0.25}
          value={shock}
          onChange={(e) => setShock(Number(e.target.value))}
        />
      </div>
      <p className="stress-headline" aria-live="polite">
        {headline}
      </p>

      <div className="chart-block">
        <p className="chart-title">Projected card charge-offs</p>
        <p className="chart-sub">Percent of card balances, quarterly, recent history and next {baseline.length} quarters</p>
        <Legend
          items={[
            { label: "History", color: "var(--chargeoff)" },
            { label: "No shock", color: "var(--chargeoff)", dashed: true },
            { label: "Stressed", color: "var(--shock)" },
          ]}
        />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 8, right: 96, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" tickFormatter={quarterTick} interval={3} {...axisProps} />
            <YAxis tickFormatter={(v: number) => `${v}%`} domain={["auto", "auto"]} width={48} {...axisProps} />
            <Tooltip
              content={<ChartTooltip names={{ history: "History", baseline: "No shock", stressed: "Stressed" }} />}
            />
            <Line dataKey="history" stroke="var(--chargeoff)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line
              dataKey="baseline"
              stroke="var(--chargeoff)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              label={<EndLabel lastIndex={lastIndex} text="No shock" color="var(--chargeoff)" dy={10} />}
            />
            <Line
              dataKey="stressed"
              stroke="var(--shock)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              label={<EndLabel lastIndex={lastIndex} text="Stressed" color="var(--shock)" dy={-10} />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="section-note">
        Computed in your browser from the published model. The no-shock path drifts toward the model's long-run mean,
        so read the gap between the lines, not either level. Illustrative scenario output, not a forecast.
      </p>
    </section>
  );
}
