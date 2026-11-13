import { useEffect, useState } from "react";
import { HistoryCharts } from "./components/HistoryCharts";
import { ModelNotes } from "./components/ModelNotes";
import { StressPanel } from "./components/StressPanel";
import { pct, quarterLabel } from "./lib/format";
import { loadPayload, PayloadError } from "./lib/payload";
import type { StressPayload } from "./types";

type State =
  | { status: "loading" }
  | { status: "ready"; payload: StressPayload; source: string }
  | { status: "error"; error: PayloadError | Error };

export default function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    loadPayload()
      .then(({ payload, source }) => setState({ status: "ready", payload, source }))
      .catch((error: Error) => setState({ status: "error", error }));
  }, []);

  return (
    <main className="page">
      <header className="masthead">
        <h1>
          FinTechCo Risk <span>Card portfolio stress test</span>
        </h1>
        {state.status === "ready" && (
          <p className="provenance">
            FRED data through {quarterLabel(state.payload.last_observed.date)}, published{" "}
            {new Date(state.payload.generated_at).toLocaleDateString("en-US", { dateStyle: "medium" })} from{" "}
            {shortSource(state.source)}
          </p>
        )}
      </header>

      {state.status === "loading" && <p className="sublead">Loading the latest published results…</p>}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && <Dashboard payload={state.payload} />}
    </main>
  );
}

function Dashboard({ payload }: { payload: StressPayload }) {
  const last = payload.last_observed;
  return (
    <>
      <p className="lead">
        Card charge-offs are <strong className="is-chargeoff">{pct(last.chargeoff)}</strong> with unemployment at{" "}
        <strong>{pct(last.unrate)}</strong>.
      </p>
      <p className="sublead">Latest quarter: {quarterLabel(last.date)}. US commercial banks, seasonally adjusted.</p>

      <StressPanel payload={payload} />

      <HistoryCharts payload={payload} />
      <ModelNotes payload={payload} />
    </>
  );
}

function ErrorState({ error }: { error: Error }) {
  if (error instanceof PayloadError && error.kind === "not_published") {
    return (
      <div className="state">
        <p className="lead">No stress results published yet.</p>
        <p>
          Run <code>python -m risk_model</code> from the repo root to publish them
          {error.source ? (
            <>
              {" "}
              to <code>{error.source}</code>
            </>
          ) : null}
          , then reload this page.
        </p>
      </div>
    );
  }
  return (
    <div className="state">
      <p className="lead">The stress results couldn't be read.</p>
      <p>
        {error.message}. Re-publish with <code>python -m risk_model</code> and check that the payload follows
        docs/DATA_CONTRACT.md.
      </p>
    </div>
  );
}

function shortSource(source: string): string {
  if (source.startsWith("gs://")) return source.replace(/\/stress_payload\.json$/, "");
  const i = source.lastIndexOf("/data/");
  return i >= 0 ? source.slice(i + 1).replace(/\/stress_payload\.json$/, "") : source;
}
