"""Fetch land-ownership polygons (BLM National SMA) for western states and
normalize the managing agency. Output: processed/ownership_<state>.geojson

Usage:
    uv run python scripts/fetch_ownership.py --state OR
    uv run python scripts/fetch_ownership.py --region pnw
"""
from __future__ import annotations

import argparse

from _common import REGIONS, STATE_BBOX, fetch_arcgis_geojson, normalize_manager, save_geojson

SERVICE = "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer/1"
FIELDS = ["ADMIN_AGENCY_CODE", "ADMIN_DEPT_CODE", "ADMIN_UNIT_NAME", "ADMIN_ST"]


def fetch_state(state: str) -> None:
    bbox = STATE_BBOX[state]
    print(f"[ownership] {state} {bbox}")
    fc = fetch_arcgis_geojson(SERVICE, bbox=bbox, out_fields=FIELDS)
    for f in fc["features"]:
        p = f.setdefault("properties", {})
        p["manager"] = normalize_manager(p.get("ADMIN_AGENCY_CODE"))
        p["unit"] = p.get("ADMIN_UNIT_NAME")
    save_geojson(fc, f"ownership_{state}.geojson")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", help="Two-letter state, e.g. OR")
    ap.add_argument("--region", choices=list(REGIONS), help="Named region (pnw, pacific, mountain-west)")
    args = ap.parse_args()

    states = [args.state] if args.state else REGIONS[args.region] if args.region else []
    if not states:
        ap.error("pass --state or --region")
    for s in states:
        fetch_state(s.upper())


if __name__ == "__main__":
    main()
