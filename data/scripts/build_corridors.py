"""Bake "likely-legal" motorized dispersed-camping corridors.

Buffers open MVUM motorized routes (~300 ft), clips to USFS/BLM land. (Wilderness
and 1-mile-developed-campground subtraction are TODOs — add PAD-US + RIDB inputs.)

Output: processed/corridors_<region>.geojson

Usage:
    uv run python scripts/build_corridors.py --region pnw
"""
from __future__ import annotations

import argparse

import geopandas as gpd
import pandas as pd
from shapely import union_all

from _common import PROCESSED, REGIONS

CORRIDOR_M = 91  # ~300 ft
METRIC = "EPSG:5070"  # CONUS Albers Equal Area (meters)
CAMP_MANAGERS = {"USFS", "BLM"}


def _load(pattern: str) -> gpd.GeoDataFrame | None:
    frames = [gpd.read_file(p) for p in sorted(PROCESSED.glob(pattern))]
    if not frames:
        return None
    gdf = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=frames[0].crs)
    return gdf.set_crs("EPSG:4326", allow_override=True) if gdf.crs is None else gdf


def build(region: str) -> None:
    states = REGIONS[region]
    roads = _load("mvum_roads_*.geojson")
    own = _load("ownership_*.geojson")
    if roads is None or own is None:
        raise SystemExit("Run fetch_ownership.py and fetch_mvum.py first.")

    # keep only routes open to some motor vehicle
    def is_open(v) -> bool:
        return str(v).strip().lower() == "open"

    motor = roads[roads["passengervehicle"].map(is_open) | roads["highclearancevehicle"].map(is_open)]
    print(f"[corridors] {region}: {len(motor)} open motorized routes across {states}")

    corridor = union_all(motor.to_crs(METRIC).buffer(CORRIDOR_M).values)

    public = own[own["manager"].isin(CAMP_MANAGERS)].to_crs(METRIC)
    public_geom = union_all(public.geometry.values)

    clipped = corridor.intersection(public_geom)
    out = gpd.GeoDataFrame({"class": ["corridor"]}, geometry=[clipped], crs=METRIC).to_crs("EPSG:4326")
    path = PROCESSED / f"corridors_{region}.geojson"
    out.to_file(path, driver="GeoJSON")
    print(f"  wrote {path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", choices=list(REGIONS), required=True)
    build(ap.parse_args().region)


if __name__ == "__main__":
    main()
