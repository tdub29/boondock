"""Shared helpers for the Boondock data pipeline."""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Iterable

import requests

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "processed"
RAW = ROOT / "raw"

# Rough WGS84 bounding boxes for the western states the app targets.
STATE_BBOX: dict[str, tuple[float, float, float, float]] = {
    "WA": (-124.85, 45.5, -116.9, 49.05),
    "OR": (-124.6, 41.9, -116.4, 46.3),
    "ID": (-117.25, 41.98, -110.99, 49.0),
    "CA": (-124.45, 32.5, -114.1, 42.05),
    "NV": (-120.0, 35.0, -114.0, 42.05),
    "MT": (-116.1, 44.3, -104.0, 49.0),
    "WY": (-111.06, 40.99, -104.05, 45.01),
    "CO": (-109.07, 36.99, -102.04, 41.01),
    "UT": (-114.06, 36.99, -109.04, 42.01),
    "AZ": (-114.82, 31.33, -109.04, 37.01),
    "NM": (-109.06, 31.33, -103.0, 37.01),
}

REGIONS: dict[str, list[str]] = {
    "pnw": ["WA", "OR", "ID"],
    "pacific": ["CA", "NV"],
    "mountain-west": ["CO", "UT", "AZ", "NM", "WY", "MT"],
}


def fetch_arcgis_geojson(
    service_url: str,
    bbox: tuple[float, float, float, float] | None = None,
    out_fields: Iterable[str] | str = "*",
    where: str = "1=1",
    page_size: int = 2000,
) -> dict:
    """Page through an ArcGIS REST layer and return a GeoJSON FeatureCollection.

    Handles `exceededTransferLimit` by walking `resultOffset`.
    """
    fields = out_fields if isinstance(out_fields, str) else ",".join(out_fields)
    features: list[dict] = []
    offset = 0
    session = requests.Session()

    while True:
        params = {
            "where": where,
            "outFields": fields,
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "geometryPrecision": "5",
        }
        if bbox:
            params.update(
                {
                    "geometry": ",".join(map(str, bbox)),
                    "geometryType": "esriGeometryEnvelope",
                    "inSR": "4326",
                    "spatialRel": "esriSpatialRelIntersects",
                }
            )
        resp = session.get(f"{service_url}/query", params=params, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        batch = data.get("features", [])
        features.extend(batch)
        print(f"    +{len(batch)} (total {len(features)})", flush=True)
        if len(batch) < page_size:
            break
        offset += page_size
        time.sleep(0.3)  # be polite to the federal service

    return {"type": "FeatureCollection", "features": features}


def save_geojson(fc: dict, name: str) -> Path:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    path = PROCESSED / name
    path.write_text(json.dumps(fc), encoding="utf-8")
    print(f"  wrote {path}  ({len(fc['features'])} features)")
    return path


def normalize_manager(raw) -> str:
    """Mirror of web/src/map/managers.ts::normalizeManager — keep in sync."""
    if raw is None:
        return "OTHER"
    s = str(raw).strip().upper()
    if not s:
        return "OTHER"
    if s in ("USFS", "FS") or "FOREST" in s:
        return "USFS"
    if s == "BLM" or "LAND MANAGEMENT" in s:
        return "BLM"
    if s == "NPS" or "PARK SERVICE" in s or "NATIONAL PARK" in s:
        return "NPS"
    if s in ("FWS", "USFW", "USFWS") or "FISH AND WILDLIFE" in s or "WILDLIFE REFUGE" in s:
        return "USFWS"
    if s in ("BOR", "USBR") or "RECLAMATION" in s:
        return "USBR"
    if s in ("DOD", "DOE") or any(k in s for k in ("DEFENSE", "ARMY", "NAVY", "AIR FORCE", "MILITARY")):
        return "DOD"
    if s == "BIA" or "TRIB" in s or "INDIAN" in s or "RESERVATION" in s:
        return "TRIBAL"
    if s in ("ST", "STAT", "STATE", "SLB") or s.startswith("STATE"):
        return "STATE"
    if s in ("PVT", "PRI") or "PRIVATE" in s:
        return "PRIVATE"
    return "OTHER"
