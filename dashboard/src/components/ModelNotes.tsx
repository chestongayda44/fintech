import { quarterLabel } from "../lib/format";
import type { StressPayload } from "../types";

export function ModelNotes({ payload }: { payload: StressPayload }) {
  const { model } = payload;
  const b = model.coefficients;
  const longRun = model.intercept / (1 - b.chargeoff_lag1);
  return (
    <section aria-labelledby="model-h">
      <h2 id="model-h">About the model</h2>
      <p className="section-note">
        An interpretable regression on public FRED data, built by Data Science and published for this dashboard.
        National figures stand in for our portfolio. Scenarios are illustrative stress paths, not forecasts.
      </p>
      <dl className="facts">
        <dt>Equation</dt>
        <dd className="formula">
          charge-offs<sub>t</sub> = {model.intercept.toFixed(2)} + {b.chargeoff_lag1.toFixed(2)} × charge-offs
          <sub>t−1</sub> + {b.unrate_chg4_lag1.toFixed(2)} × (1-year change in unemployment)<sub>t−1</sub>
        </dd>
        <dt>What it says</dt>
        <dd>
          Each point unemployment rises over a year adds about {b.unrate_chg4_lag1.toFixed(2)} points to next
          quarter's charge-off rate, and the effect carries forward ({Math.round(b.chargeoff_lag1 * 100)}% persists
          each quarter). With no shock, charge-offs drift toward a long-run {longRun.toFixed(1)}%.
        </dd>
        <dt>Fit</dt>
        <dd>
          {quarterLabel(model.sample_start)} to {quarterLabel(model.sample_end)}, {model.n_obs} quarters, R²{" "}
          {model.r_squared.toFixed(2)}
        </dd>
        {model.excluded.map((e) => (
          <div key={e.start} style={{ display: "contents" }}>
            <dt>Left out</dt>
            <dd>
              {quarterLabel(e.start)} to {quarterLabel(e.end)}: {e.reason}
            </dd>
          </div>
        ))}
        <dt>Series</dt>
        <dd>{Object.entries(payload.series).map(([k, v]) => `${v} (${k})`).join(", ")}</dd>
      </dl>
    </section>
  );
}
