"""Merge per-state processed GeoJSON into one file per tile layer, ready for
tippecanoe. Output: raw/tile_input/{ownership,mvum_roads,mvum_trails,corridors}.geojson

Usage: uv run python scripts/merge_layers.py --region pnw
"""
from __future__ import annotations

import argparse
import json

from _common import PROCESSED, RAW, REGIONS


def merge(region: str) -> None:
    states = REGIONS[region]
    out_dir = RAW / "tile_input"
    out_dir.mkdir(parents=True, exist_ok=True)
    layers = {
        "ownership": [PROCESSED / f"ownership_{s}.geojson" for s in states],
        "mvum_roads": [PROCESSED / f"mvum_roads_{s}.geojson" for s in states],
        "mvum_trails": [PROCESSED / f"mvum_trails_{s}.geojson" for s in states],
        "nfs_trails": [PROCESSED / f"nfs_trails_{s}.geojson" for s in states],
        "poi": [PROCESSED / f"gnis_poi_{s}.geojson" for s in states],
        "corridors": [PROCESSED / f"corridors_{region}.geojson"],
    }
    for name, files in layers.items():
        feats: list[dict] = []
        for fp in files:
            if fp.exists():
                feats.extend(json.loads(fp.read_text(encoding="utf-8")).get("features", []))
        if feats:
            (out_dir / f"{name}.geojson").write_text(
                json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8"
            )
            print(f"  {name}: {len(feats)} features")
        else:
            print(f"  {name}: (no input — skipped)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", choices=list(REGIONS), required=True)
    merge(ap.parse_args().region)


if __name__ == "__main__":
    main()
