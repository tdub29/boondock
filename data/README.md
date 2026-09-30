# Boondock data pipeline

Fetches free federal public-land + MVUM data and bakes **PMTiles** for offline use.
The web app works **online without this** (it queries the same services live); run
the pipeline to enable **offline** regions and precomputed camping corridors.

## Setup

```powershell
uv sync          # creates .venv from pyproject.toml (geopandas, shapely, requests, pyproj)
```

## Run (PNW example)

```powershell
uv run python scripts/fetch_ownership.py --region pnw   # BLM SMA → ownership_<state>.geojson
uv run python scripts/fetch_mvum.py      --region pnw   # USFS MVUM roads + trails
uv run python scripts/fetch_trails_poi.py --region pnw  # USFS NFS hiking trails + GNIS/INFRA POIs → nfs_trails_<state>.geojson, gnis_poi_<state>.geojson
uv run python scripts/build_corridors.py --region pnw   # buffer routes → corridors_pnw.geojson
pwsh scripts/build_tiles.ps1 -Region pnw                # tippecanoe (Docker) → web/public/tiles/pnw.pmtiles
```

Regions: `pnw` (WA/OR/ID), `pacific` (CA/NV), `mountain-west` (CO/UT/AZ/NM/WY/MT) — see `_common.py`.
You can also fetch a single state with `--state OR`.

## Layout

| Dir | What | Git |
|---|---|---|
| `scripts/` | pipeline code | tracked |
| `raw/` | merged tile inputs | ignored |
| `processed/` | cleaned per-state GeoJSON | ignored |
| `tiles/` | built PMTiles | ignored |
| `sources.yaml` | dataset provenance + licenses | tracked |

## Notes / TODO

- `build_corridors.py` currently buffers open MVUM routes and clips to USFS/BLM land.
  Subtracting **Wilderness** (PAD-US) and a **1-mile developed-campground** buffer (RIDB)
  is a documented TODO — wire those inputs to tighten the "likely-legal" layer.
- tippecanoe runs in Docker (`felt/tippecanoe`); no native Windows build exists.
  GDAL fallback: `ogr2ogr -f MBTiles out.mbtiles in.geojson` then `pmtiles convert`.
- `normalize_manager()` in `_common.py` must stay in sync with `web/src/map/managers.ts`.
