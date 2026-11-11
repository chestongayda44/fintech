import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct, quarterLabel, quarterTick } from "../lib/format";
import type { StressPayload } from "../types";
import { axisProps, ChartTooltip, EndLabel, gridProps, Legend } from "./ChartParts";

const FROM = "2005-01-01";

/** "2021-12-31" -> "2021-10-01": align a date to the first day of its quarter. */
function quarterStart(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
}

export function HistoryCharts({ payload }: { payload: StressPayload }) {
  const rows = payload.history.filter((r) => r.date >= FROM);
  const last = rows.length - 1;
  const excluded = payload.model.excluded.map((e) => ({ x1: quarterStart(e.start), x2: quarterStart(e.end) }));
  const tickEvery = Math.max(1, Math.round(rows.length / 10)) - 1;

  return (
    <section aria-labelledby="history-h">
      <h2 id="history-h">How we got here</h2>
      <p className="section-note">
        Card losses climb when unemployment is rising, not just when it is high: losses fell through 2010–14 while
        unemployment stayed elevated. In 2020 stimulus and forbearance pushed losses down while unemployment spiked,
        so those quarters are left out of the model fit.
      </p>

      <div className="chart-block">
        <p className="chart-title">Card losses</p>
        <p className="chart-sub">Percent of card balances, US commercial banks, quarterly</p>
        <Legend
          items={[
            { label: "Charge-off rate", color: "var(--chargeoff)" },
            { label: "Delinquency rate", color: "var(--delinquency)" },
            { label: "Left out of model fit", color: "var(--band)", band: true },
          ]}
        />
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows} syncId="history" margin={{ top: 8, right: 132, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            {excluded.map((e) => (
              <ReferenceArea key={e.x1} x1={e.x1} x2={e.x2} fill="var(--band)" fillOpacity={1} ifOverflow="hidden" />
            ))}
            <XAxis dataKey="date" {...axisProps} tickFormatter={quarterTick} interval={tickEvery} minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={(v: number) => `${v}%`} domain={[0, "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
              content={<ChartTooltip names={{ chargeoff: "Charge-off rate", delinquency: "Delinquency rate" }} />}
            />
            <Line
              type="linear" dataKey="chargeoff" stroke="var(--chargeoff)" strokeWidth={2} dot={false}
              activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }} isAnimationActive={false}
              label={<EndLabel lastIndex={last} text={`Charge-offs ${pct(rows[last]?.chargeoff)}`} color="var(--chargeoff)" dy={-8} />}
            />
            <Line
              type="linear" dataKey="delinquency" stroke="var(--delinquency)" strokeWidth={2} dot={false}
              activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }} isAnimationActive={false}
              label={<EndLabel lastIndex={last} text={`Delinquency ${pct(rows[last]?.delinquency)}`} color="var(--delinquency)" dy={8} />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-block">
        <p className="chart-title">Unemployment rate</p>
        <p className="chart-sub">Percent of labor force, quarterly average</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={rows} syncId="history" margin={{ top: 8, right: 132, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            {excluded.map((e) => (
              <ReferenceArea key={e.x1} x1={e.x1} x2={e.x2} fill="var(--band)" fillOpacity={1} ifOverflow="hidden" />
            ))}
            <XAxis dataKey="date" {...axisProps} tickFormatter={quarterTick} interval={tickEvery} minTickGap={16} />
            <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={(v: number) => `${v}%`} domain={[0, "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
              content={<ChartTooltip names={{ unrate: "Unemployment" }} />}
            />
            <Line
              type="linear" dataKey="unrate" stroke="var(--unrate)" strokeWidth={2} dot={false}
              activeDot={{ r: 5, stroke: "var(--paper)", strokeWidth: 2 }} isAnimationActive={false}
              label={<EndLabel lastIndex={last} text={pct(rows[last]?.unrate)} color="var(--unrate)" />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="table-view">
        <summary>Show the numbers</summary>
        <table>
          <thead>
            <tr><th>Quarter</th><th>Charge-offs</th><th>Delinquency</th><th>Unemployment</th></tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.date}>
                <td>{quarterLabel(r.date)}</td><td>{pct(r.chargeoff)}</td><td>{pct(r.delinquency)}</td><td>{pct(r.unrate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
