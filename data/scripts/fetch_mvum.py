"""Fetch USFS Motor Vehicle Use Map roads + trails for western states.
Output: processed/mvum_roads_<state>.geojson, processed/mvum_trails_<state>.geojson

Usage:
    uv run python scripts/fetch_mvum.py --state OR
    uv run python scripts/fetch_mvum.py --region pnw
"""
from __future__ import annotations

import argparse

from _common import REGIONS, STATE_BBOX, fetch_arcgis_geojson, save_geojson

ROADS = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1"
TRAILS = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/2"

ROAD_FIELDS = [
    "name", "id", "mvum_symbol_name", "operationalmaintlevel", "surfacetype",
    "seasonal", "passengervehicle", "highclearancevehicle", "forestname", "districtname",
]
TRAIL_FIELDS = [
    "name", "id", "mvum_symbol_name", "seasonal", "atv", "motorcycle",
    "highclearancevehicle", "forestname", "districtname",
]


def fetch_state(state: str) -> None:
    bbox = STATE_BBOX[state]
    print(f"[mvum roads] {state}")
    save_geojson(fetch_arcgis_geojson(ROADS, bbox=bbox, out_fields=ROAD_FIELDS), f"mvum_roads_{state}.geojson")
    print(f"[mvum trails] {state}")
    save_geojson(fetch_arcgis_geojson(TRAILS, bbox=bbox, out_fields=TRAIL_FIELDS), f"mvum_trails_{state}.geojson")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state")
    ap.add_argument("--region", choices=list(REGIONS))
    args = ap.parse_args()
    states = [args.state] if args.state else REGIONS[args.region] if args.region else []
    if not states:
        ap.error("pass --state or --region")
    for s in states:
        fetch_state(s.upper())


if __name__ == "__main__":
    main()
