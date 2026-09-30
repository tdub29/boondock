"""Fetch hiking trails + named natural POIs for western states.

Two new overlays, same free/federal sources the live web app queries:
  - Hiking trails : USFS National Forest System Trails (EDW_TrailNFSPublish_01/0)
  - Named POIs    : USGS GNIS summits + lakes/reservoirs (carto.nationalmap.gov
                    geonames) and USFS INFRA trailheads, merged into one point
                    layer tagged with `poi_kind` (peak | lake | trailhead).

Output:
  processed/nfs_trails_<state>.geojson
  processed/gnis_poi_<state>.geojson

Usage:
    uv run python scripts/fetch_trails_poi.py --state OR
    uv run python scripts/fetch_trails_poi.py --region pnw
    uv run python scripts/fetch_trails_poi.py --selfcheck   # offline logic test
"""
from __future__ import annotations

import argparse

from _common import REGIONS, STATE_BBOX, fetch_arcgis_geojson, save_geojson

NFS_TRAILS = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0"
GNIS_LANDFORMS = "https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer/5"
GNIS_HYDRO = "https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer/7"
INFRA_REC = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0"

TRAIL_FIELDS = ["trail_name", "trail_no", "trail_class", "trail_surface", "national_trail_designation", "hiker_pedestrian_managed"]


def tag_poi(features: list[dict], kind: str, name_field: str) -> list[dict]:
    """Stamp `poi_kind` + a normalized `name` onto each feature (in place)."""
    for f in features:
        p = f.setdefault("properties", {})
        p["poi_kind"] = kind
        p["name"] = p.get(name_field) or ""
    return features


def fetch_state(state: str) -> None:
    bbox = STATE_BBOX[state]

    print(f"[nfs trails] {state}")
    save_geojson(fetch_arcgis_geojson(NFS_TRAILS, bbox=bbox, out_fields=TRAIL_FIELDS), f"nfs_trails_{state}.geojson")

    print(f"[gnis + trailhead poi] {state}")
    peaks = tag_poi(
        fetch_arcgis_geojson(GNIS_LANDFORMS, bbox=bbox, out_fields=["gaz_name", "gaz_featureclass"], where="gaz_featureclass = 'Summit'")["features"],
        "peak",
        "gaz_name",
    )
    lakes = tag_poi(
        fetch_arcgis_geojson(GNIS_HYDRO, bbox=bbox, out_fields=["gaz_name", "gaz_featureclass"], where="gaz_featureclass IN ('Lake','Reservoir')")["features"],
        "lake",
        "gaz_name",
    )
    trailheads = tag_poi(
        fetch_arcgis_geojson(INFRA_REC, bbox=bbox, out_fields=["site_name", "site_subtype", "recarea_name"], where="site_subtype = 'TRAILHEAD'")["features"],
        "trailhead",
        "site_name",
    )
    save_geojson({"type": "FeatureCollection", "features": peaks + lakes + trailheads}, f"gnis_poi_{state}.geojson")


def _selfcheck() -> None:
    feats = [{"properties": {"gaz_name": "Mount Hood"}, "geometry": None}]
    out = tag_poi(feats, "peak", "gaz_name")
    assert out[0]["properties"]["poi_kind"] == "peak"
    assert out[0]["properties"]["name"] == "Mount Hood"
    # missing name field → empty string, not KeyError
    assert tag_poi([{"properties": {}}], "lake", "gaz_name")[0]["properties"]["name"] == ""
    print("selfcheck ok")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state")
    ap.add_argument("--region", choices=list(REGIONS))
    ap.add_argument("--selfcheck", action="store_true")
    args = ap.parse_args()
    if args.selfcheck:
        _selfcheck()
        return
    states = [args.state] if args.state else REGIONS[args.region] if args.region else []
    if not states:
        ap.error("pass --state or --region (or --selfcheck)")
    for s in states:
        fetch_state(s.upper())


if __name__ == "__main__":
    main()
