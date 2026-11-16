import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct, points, quarterLabel, quarterTick } from "../lib/format";
import { project, stressGap } from "../lib/projection";
import type { StressPayload } from "../types";
import { axisProps, ChartTooltip, EndLabel, gridProps, Legend } from "./ChartParts";

const HISTORY_QUARTERS = 12;

interface Row {
  date: string;
  history?: number | null;
  baseline?: number;
  stressed?: number;
}

export function StressPanel({ payload }: { payload: StressPayload }) {
  const [shock, setShock] = useState(payload.scenario_defaults.shock_pp);
  const ramp = payload.scenario_defaults.ramp_quarters;
  const last = payload.last_observed;

  const baseline = useMemo(() => project(payload, 0), [payload]);
  const stressed = useMemo(() => project(payload, shock), [payload, shock]);
  const gap = stressGap(baseline, stressed);

  const rows: Row[] = [
    ...payload.history.slice(-HISTORY_QUARTERS).map((r) => ({ date: r.date, history: r.chargeoff })),
    ...baseline.map((b, i) => ({ date: b.date, baseline: b.chargeoff, stressed: stressed[i].chargeoff })),
  ];
  // Join both projected paths to the last observed quarter.
  const join = rows.findIndex((r) => r.date === last.date);
  if (join >= 0) rows[join] = { ...rows[join], baseline: last.chargeoff, stressed: last.chargeoff };
  const end = rows.length - 1;

  return (
    <section aria-labelledby="stress-h">
      <h2 id="stress-h">Stress scenarios</h2>
      <label className="shock-control">
        <span>
          Unemployment rises by <strong className="is-shock">{points(shock, 2)}</strong>, phased in over {ramp}{" "}
          quarters
        </span>
        <input
          type="range" min={0} max={5} step={0.25} value={shock}
          onChange={(e) => setShock(Number(e.target.value))}
          aria-valuetext={`${shock} percentage points`}
        />
      </label>

      <p className="lead" aria-live="polite">
        {shock === 0 ? (
          <>With no unemployment shock, charge-offs follow the no-shock path.</>
        ) : (
          <>
            A {points(shock, 2)} rise in unemployment adds up to{" "}
            <strong className="is-shock">{points(gap.peakGap, 2)}</strong> to card charge-offs, peaking in{" "}
            {quarterLabel(gap.peakDate)} at <strong className="is-shock">{pct(gap.peakStressed)}</strong>.
          </>
        )}
      </p>

      <div className="chart-block">
        <p className="chart-title">Card charge-off rate: history and projections</p>
        <p className="chart-sub">Percent of card balances, quarterly</p>
        <Legend
          items={[
            { label: "Recent history", color: "var(--chargeoff)" },
            { label: "No shock", color: "var(--chargeoff)", dashed: true },
            { label: "Stressed", color: "var(--shock)" },
          ]}
        />
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows} margin={{ top: 8, right: 132, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={quarterTick} minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={(v: number) => `${v}%`} domain={[0, "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
              content={<ChartTooltip names={{ history: "Charge-offs", baseline: "No shock", stressed: "Stressed" }} />}
            />
            <Line type="linear" dataKey="history" stroke="var(--chargeoff)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line
              type="linear" dataKey="baseline" stroke="var(--chargeoff)" strokeWidth={2} strokeDasharray="5 4"
              dot={false} isAnimationActive={false}
              label={<EndLabel lastIndex={end} text={`No shock ${pct(rows[end]?.baseline)}`} color="var(--chargeoff)" dy={8} />}
            />
            <Line
              type="linear" dataKey="stressed" stroke="var(--shock)" strokeWidth={2} dot={false} isAnimationActive={false}
              label={<EndLabel lastIndex={end} text={`Stressed ${pct(rows[end]?.stressed)}`} color="var(--shock)" dy={-8} />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="section-note">
        Illustrative scenario output, not a forecast. Even with no shock, the projection drifts toward the model's
        long-run average, so read the gap between the two paths rather than either level.
      </p>
    </section>
  );
}
