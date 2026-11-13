import { useId, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct, points, quarterLabel, quarterTick } from "../lib/format";
import { headline, project } from "../lib/project";
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
  const sliderId = useId();
  const { ramp_quarters: ramp } = payload.scenario_defaults;

  const baseline = useMemo(() => project(payload, 0), [payload]);
  const stressed = useMemo(() => project(payload, shock), [payload, shock]);

  const rows = useMemo<Row[]>(() => {
    const hist: Row[] = payload.history.slice(-HISTORY_QUARTERS).map((r) => ({ date: r.date, history: r.chargeoff }));
    const lastObs = payload.last_observed;
    // Join point: both projected paths start from the last observed quarter so the lines connect.
    const join = hist.find((r) => r.date === lastObs.date);
    if (join) Object.assign(join, { baseline: lastObs.chargeoff, stressed: lastObs.chargeoff });
    const future: Row[] = baseline.map((b, i) => ({ date: b.date, baseline: b.chargeoff, stressed: stressed[i].chargeoff }));
    return [...hist, ...future];
  }, [payload, baseline, stressed]);

  const lastIdx = rows.length - 1;
  const text = headline(shock, baseline, stressed);
  const tickEvery = Math.max(1, Math.round(rows.length / 8)) - 1;

  return (
    <section aria-labelledby="stress-h" className="stress-panel">
      <h2 id="stress-h">Stress scenarios</h2>
      <p className="stress-headline" aria-live="polite">{text}</p>

      <div className="stress-control">
        <label htmlFor={sliderId}>
          Unemployment rise: <strong className="is-shock">+{points(shock)}</strong>
          <span className="stress-hint"> phased in over {ramp} quarters (one year)</span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={5}
          step={0.5}
          value={shock}
          onChange={(e) => setShock(Number(e.target.value))}
        />
        <div className="stress-scale" aria-hidden>
          <span>0</span>
          <span>5 points</span>
        </div>
      </div>

      <div className="chart-block">
        <p className="chart-title">Card charge-offs: no shock vs stressed</p>
        <p className="chart-sub">Percent of card balances, recent history and the next {baseline.length} quarters</p>
        <Legend
          items={[
            { label: "History", color: "var(--chargeoff)" },
            { label: "No shock", color: "var(--chargeoff)", dashed: true },
            { label: "Stressed", color: "var(--shock)" },
          ]}
        />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={rows} margin={{ top: 8, right: 132, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={quarterTick} interval={tickEvery} minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={(v: number) => `${v}%`} domain={[0, "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
              content={<ChartTooltip names={{ history: "Observed", baseline: "No shock", stressed: "Stressed" }} />}
            />
            <Line type="linear" dataKey="history" stroke="var(--chargeoff)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line
              type="linear" dataKey="baseline" stroke="var(--chargeoff)" strokeWidth={2} strokeDasharray="5 4" dot={false}
              isAnimationActive={false}
              label={<EndLabel lastIndex={lastIdx} text={`No shock ${pct(baseline[baseline.length - 1]?.chargeoff)}`} color="var(--chargeoff)" dy={10} />}
            />
            <Line
              type="linear" dataKey="stressed" stroke="var(--shock)" strokeWidth={2} dot={false}
              activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }} isAnimationActive={false}
              label={<EndLabel lastIndex={lastIdx} text={`Stressed ${pct(stressed[stressed.length - 1]?.chargeoff)}`} color="var(--shock)" dy={-10} />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="section-note">
        Illustrative scenario, not a forecast. The model links losses to the <em>change</em> in unemployment over the
        past year, so a rise pushes charge-offs up with a one-quarter delay; the no-shock path drifts toward the model's
        long-run mean.
      </p>

      <details className="table-view">
        <summary>Show the numbers</summary>
        <table>
          <thead>
            <tr><th>Quarter</th><th>No shock</th><th>Stressed</th><th>Gap</th><th>Unemployment (stressed)</th></tr>
          </thead>
          <tbody>
            {stressed.map((s, i) => (
              <tr key={s.date}>
                <td>{quarterLabel(s.date)}</td>
                <td>{pct(baseline[i].chargeoff)}</td>
                <td>{pct(s.chargeoff)}</td>
                <td>{(s.chargeoff - baseline[i].chargeoff).toFixed(2)}</td>
                <td>{pct(s.unrate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
