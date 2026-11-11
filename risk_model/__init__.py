"""FinTechCo macro credit risk: FRED data → quarterly panel → stress scenarios."""
from risk_model.fred_client import SERIES, load_all, parse_observations
from risk_model.model import fit, project, sanity_check, stress_payload
from risk_model.transforms import build_quarterly_panel

__all__ = [
    "SERIES",
    "build_quarterly_panel",
    "fit",
    "load_all",
    "parse_observations",
    "project",
    "sanity_check",
    "stress_payload",
]
