"""CLI entry point: python -m risk_model"""
from risk_model.fred_client import load_all_series
from risk_model.model import build_stress_payload, fit
from risk_model.storage import publish
from risk_model.transforms import build_panel


def main() -> None:
    raw, source = load_all_series()
    print(f"Loaded {len(raw)} series from {source}")

    panel = build_panel(raw)
    print(f"Panel: {len(panel)} quarters, {panel.notna().all(axis=1).sum()} complete")

    model = fit(panel)
    coef = model.params["unrate_chg4_lag1"]
    print(f"Model: unrate_chg4 coeff = {coef:+.4f} (t={model.tvalues['unrate_chg4_lag1']:.1f})")

    payload = build_stress_payload(panel, model, source)
    dest = publish(panel, payload)
    print(f"Published to {dest}")


if __name__ == "__main__":
    main()
