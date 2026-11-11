# dashboard/ — Card portfolio stress test (SWE stage)

React + Vite + TypeScript + Recharts. Reads the stress payload the data science pipeline
publishes (`docs/DATA_CONTRACT.md`) and shows it to Risk leadership.

```bash
cd dashboard
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
```

The dev server serves the payload at `/api/stress_payload.json` from the same place the Python side
publishes it: `gs://$GCS_BUCKET/$GCS_PREFIX/` when `DATA_SOURCE=gcs` (via `gcloud storage cat`), otherwise
`../data/published/`. Load `.env` first (the `swe` persona does this).

Starting state for the live demo: data loading, history charts, model notes, and an empty
"Stress scenarios" slot. Live task: build the stress panel in that slot (see docs/DEMO_SCRIPT.md, stage 5).
