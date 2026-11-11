import { useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { pct, pointRise, points, quarterLabel, quarterTick } from "../lib/format";
import { project, stressImpact } from "../lib/projection";
import type { StressPayload } from "../types";
import { axisProps, ChartTooltip, EndLabel, gridProps, Legend } from "./ChartParts";

const MAX_SHOCK = 5;
const STEP = 0.25;
const HISTORY_QUARTERS = 12;

interface Row {
  date: string;
  history?: number;
  baseline?: number;
  shock?: number;
  uHistory?: number;
  uBaseline?: number;
  uShock?: number;
}

export function StressPanel({ payload }: { payload: StressPayload }) {
  const [shockPp, setShockPp] = useState(payload.scenario_defaults.shock_pp);
  const sliderId = useId();
  const last = payload.last_observed;

  const baseline = useMemo(() => project(payload, 0), [payload]);
  const shocked = useMemo(() => project(payload, shockPp), [payload, shockPp]);
  const impact = stressImpact(baseline, shocked);

  // Fixed y-range (sized for the largest shock) so the chart doesn't rescale while dragging.
  const yMax = useMemo(() => {
    const worst = project(payload, MAX_SHOCK);
    const hist = payload.history.slice(-HISTORY_QUARTERS).map((r) => r.chargeoff ?? 0);
    return Math.ceil((Math.max(...hist, ...worst.map((p) => p.chargeoff)) + 0.5) / 3) * 3;
  }, [payload]);
  const uMax = Math.ceil((last.unrate + MAX_SHOCK + 0.5) / 3) * 3;
  const ticks = (max: number) => Array.from({ length: max / 3 + 1 }, (_, i) => i * 3);

  const rows: Row[] = useMemo(() => {
    const hist = payload.history.filter((r) => r.date <= last.date).slice(-HISTORY_QUARTERS);
    const out: Row[] = hist.map((r) => ({
      date: r.date,
      history: r.chargeoff ?? undefined,
      uHistory: r.unrate ?? undefined,
    }));
    // Projections start from the last observed point so the lines connect.
    const anchor = out[out.length - 1];
    if (anchor) Object.assign(anchor, { baseline: last.chargeoff, shock: last.chargeoff, uBaseline: last.unrate, uShock: last.unrate });
    baseline.forEach((b, i) =>
      out.push({ date: b.date, baseline: b.chargeoff, shock: shocked[i].chargeoff, uBaseline: b.unrate, uShock: shocked[i].unrate }),
    );
    return out;
  }, [payload, baseline, shocked, last]);

  const lastIndex = rows.length - 1;
  const hasShock = shockPp > 0;

  return (
    <section aria-labelledby="stress-h" className="stress">
      <h2 id="stress-h" className="visually-hidden">Stress scenario</h2>
      <p className="lead stress-lead" aria-live="polite">
        {hasShock ? (
          <>
            A <strong className="is-shock">{pointRise(shockPp)}</strong> rise in unemployment adds{" "}
            <strong className="is-shock">{points(impact.peakGap)}</strong> to card charge‑offs at the peak, in{" "}
            {quarterLabel(impact.peakDate)}.
          </>
        ) : (
          <>
            With unemployment flat, charge‑offs drift from <strong className="is-chargeoff">{pct(last.chargeoff)}</strong>{" "}
            to <strong className="is-chargeoff">{pct(baseline[baseline.length - 1].chargeoff)}</strong> over two years.
          </>
        )}
      </p>

      <div className="control">
        <label htmlFor={sliderId}>Unemployment rise, phased in over the next year</label>
        <div className="control-row">
          <input
            id={sliderId}
            type="range"
            min={0}
            max={MAX_SHOCK}
            step={STEP}
            value={shockPp}
            onChange={(e) => setShockPp(Number(e.target.value))}
            aria-valuetext={`${shockPp} percentage points`}
          />
          <output htmlFor={sliderId} className="control-value">
            +{shockPp.toFixed(2)} pts
          </output>
        </div>
        <p className="control-note">
          Unemployment goes from {pct(last.unrate)} to {pct(last.unrate + shockPp)} by{" "}
          {quarterLabel(shocked[payload.scenario_defaults.ramp_quarters - 1].date)}, then holds.
          {hasShock && (
            <>
              {" "}
              Peak charge-offs {pct(impact.shockAtPeak)} vs {pct(impact.baselineAtPeak)} with no shock.
            </>
          )}
        </p>
      </div>

      <div className="chart-block">
        <p className="chart-title">Card charge-off rate</p>
        <Legend
          items={[
            { label: "History", color: "var(--chargeoff)" },
            { label: "No shock", color: "var(--chargeoff)", dashed: true },
            { label: "Stress scenario", color: "var(--shock)", dashed: true },
          ]}
        />
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={rows} syncId="stress" margin={{ top: 12, right: 132, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={quarterTick} interval={1} />
            <YAxis {...axisProps} axisLine={false} width={44} domain={[0, yMax]} ticks={ticks(yMax)} tickFormatter={(v: number) => `${v}%`} />
            <ReferenceLine x={last.date} stroke="var(--ink-3)" strokeDasharray="2 4" label={{ value: "Latest data", position: "insideTopLeft", fill: "var(--ink-2)", fontSize: 12 }} />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
              content={<ChartTooltip names={{ history: "Charge-offs", baseline: "No shock", shock: "Stress scenario" }} />}
            />
            <Line dataKey="history" stroke="var(--chargeoff)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }} />
            <Line
              dataKey="baseline" stroke="var(--chargeoff)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false}
              activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }}
              label={<EndLabel lastIndex={lastIndex} text={`No shock ${pct(baseline[baseline.length - 1].chargeoff)}`} color="var(--chargeoff)" dy={hasShock ? 10 : 0} />}
            />
            {hasShock && (
              <Line
                dataKey="shock" stroke="var(--shock)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false}
                activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }}
                label={<EndLabel lastIndex={lastIndex} text={`Stress ${pct(shocked[shocked.length - 1].chargeoff)}`} color="var(--shock)" dy={-10} />}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-block">
        <p className="chart-title">Unemployment rate assumed</p>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={rows} syncId="stress" margin={{ top: 8, right: 132, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={quarterTick} interval={1} />
            <YAxis {...axisProps} axisLine={false} width={44} domain={[0, uMax]} ticks={ticks(uMax)} tickFormatter={(v: number) => `${v}%`} />
            <ReferenceLine x={last.date} stroke="var(--ink-3)" strokeDasharray="2 4" />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
              content={<ChartTooltip names={{ uHistory: "Unemployment", uBaseline: "No shock", uShock: "Stress scenario" }} />}
            />
            <Line dataKey="uHistory" stroke="var(--unrate)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }} />
            <Line dataKey="uBaseline" stroke="var(--unrate)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }} />
            {hasShock && (
              <Line
                dataKey="uShock" stroke="var(--shock)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false}
                activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }}
                label={<EndLabel lastIndex={lastIndex} text={pct(last.unrate + shockPp)} color="var(--shock)" />}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="table-view">
        <summary>Show the numbers</summary>
        <table>
          <thead>
            <tr><th>Quarter</th><th>Unemployment</th><th>No shock</th><th>Stress scenario</th><th>Difference</th></tr>
          </thead>
          <tbody>
            {baseline.map((b, i) => (
              <tr key={b.date}>
                <td>{quarterLabel(b.date)}</td>
                <td>{pct(shocked[i].unrate)}</td>
                <td>{pct(b.chargeoff)}</td>
                <td>{pct(shocked[i].chargeoff)}</td>
                <td>+{(shocked[i].chargeoff - b.chargeoff).toFixed(2)} pts</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
