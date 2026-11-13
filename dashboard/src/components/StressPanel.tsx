import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct, points, quarterLabel, quarterTick } from "../lib/format";
import { peakGap, project } from "../lib/projection";
import type { StressPayload } from "../types";
import { axisProps, ChartTooltip, EndLabel, gridProps, Legend } from "./ChartParts";

const HISTORY_QUARTERS = 12;
const MAX_SHOCK = 5;

interface Row {
  date: string;
  actual?: number | null;
  baseline?: number;
  stressed?: number;
}

export function StressPanel({ payload }: { payload: StressPayload }) {
  const [shock, setShock] = useState(payload.scenario_defaults.shock_pp);
  const last = payload.last_observed;
  const baseline = useMemo(() => project(payload, 0), [payload]);
  const stressed = useMemo(() => project(payload, shock), [payload, shock]);
  const peak = peakGap(baseline, stressed);
  const ramp = payload.scenario_defaults.ramp_quarters;

  const rows: Row[] = [
    ...payload.history.filter((r) => r.date <= last.date).slice(-HISTORY_QUARTERS).map((r) => ({ date: r.date, actual: r.chargeoff })),
  ];
  // Seed projections at the last observed quarter so the lines connect to history.
  rows[rows.length - 1] = { ...rows[rows.length - 1], baseline: last.chargeoff, stressed: last.chargeoff };
  baseline.forEach((b, i) => rows.push({ date: b.date, baseline: b.chargeoff, stressed: stressed[i].chargeoff }));
  const lastIndex = rows.length - 1;

  const headline =
    peak.gap > 0 ? (
      <>
        A {points(shock, shock % 1 ? 2 : 0)} rise in unemployment adds up to{" "}
        <strong className="is-shock">{points(peak.gap, 2)}</strong> to card charge-offs, peaking at{" "}
        {pct(stressed[peak.index].chargeoff)} in {quarterLabel(stressed[peak.index].date)} versus{" "}
        {pct(baseline[peak.index].chargeoff)} with no shock.
      </>
    ) : (
      <>With no unemployment shock, charge-offs follow the baseline path.</>
    );

  return (
    <section aria-labelledby="stress-h">
      <h2 id="stress-h">Stress scenarios</h2>
      <div className="stress-controls">
        <label htmlFor="shock">
          Unemployment rise, phased in over {ramp === 4 ? "a year" : `${ramp} quarters`}{" "}
          <output htmlFor="shock">+{shock.toFixed(2)} pts</output>
        </label>
        <input
          id="shock" type="range" min={0} max={MAX_SHOCK} step={0.25} value={shock}
          onChange={(e) => setShock(Number(e.target.value))}
        />
      </div>
      <p className="headline" aria-live="polite">{headline}</p>

      <div className="chart-block">
        <p className="chart-title">Charge-off rate: history and projection</p>
        <p className="chart-sub">Percent of card balances, quarterly</p>
        <Legend
          items={[
            { label: "Actual", color: "var(--chargeoff)" },
            { label: "No shock", color: "var(--chargeoff)", dashed: true },
            { label: "Stressed", color: "var(--shock)" },
          ]}
        />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 8, right: 132, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={quarterTick} minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={(v: number) => `${v}%`} domain={[0, "auto"]} />
            <ReferenceLine x={last.date} stroke="var(--ink-3)" strokeDasharray="2 3" label={{ value: "Projection →", position: "insideTopRight", fill: "var(--ink-2)", fontSize: 12 }} />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
              content={<ChartTooltip names={{ actual: "Actual", baseline: "No shock", stressed: "Stressed" }} />}
            />
            <Line type="linear" dataKey="actual" stroke="var(--chargeoff)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line
              type="linear" dataKey="baseline" stroke="var(--chargeoff)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false}
              label={<EndLabel lastIndex={lastIndex} text={`No shock ${pct(baseline.at(-1)?.chargeoff)}`} color="var(--chargeoff)" dy={10} />}
            />
            <Line
              type="linear" dataKey="stressed" stroke="var(--shock)" strokeWidth={2} dot={false} isAnimationActive={false}
              label={<EndLabel lastIndex={lastIndex} text={`Stressed ${pct(stressed.at(-1)?.chargeoff)}`} color="var(--shock)" dy={-10} />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="section-note">
        Illustrative scenario from an interpretable OLS model, not a forecast. The no-shock path drifts toward the
        model's long-run mean, so read the gap between the lines, not either level on its own.
      </p>
    </section>
  );
}
