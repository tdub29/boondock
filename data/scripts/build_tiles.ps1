<#
.SYNOPSIS
  Bake a region's overlays into a single PMTiles file via tippecanoe (Docker).

.EXAMPLE
  pwsh scripts/build_tiles.ps1 -Region pnw

.NOTES
  Pipeline order:
    uv run python scripts/fetch_ownership.py --region pnw
    uv run python scripts/fetch_mvum.py      --region pnw
    uv run python scripts/build_corridors.py --region pnw
    pwsh scripts/build_tiles.ps1 -Region pnw
  Output is written to web/public/tiles/<region>.pmtiles (served by the app).

  Windows has no native tippecanoe — this uses the `felt/tippecanoe` Docker image.
  GDAL fallback (no Docker): ogr2ogr -f MBTiles out.mbtiles in.geojson; then `pmtiles convert`.
#>
param(
  [ValidateSet("pnw", "pacific", "mountain-west")]
  [string]$Region = "pnw",
  [int]$MaxZoom = 14,
  [int]$MinZoom = 5
)

$ErrorActionPreference = "Stop"
$dataDir = (Resolve-Path "$PSScriptRoot/..").Path
$tilesOut = (Resolve-Path "$PSScriptRoot/../../web/public").Path + "/tiles"
New-Item -ItemType Directory -Force -Path $tilesOut | Out-Null
New-Item -ItemType Directory -Force -Path "$dataDir/tiles" | Out-Null

Write-Host "==> Merging layers for $Region" -ForegroundColor Cyan
uv run python "$PSScriptRoot/merge_layers.py" --region $Region

$inputDir = "$dataDir/raw/tile_input"
$layers = @("ownership", "mvum_roads", "mvum_trails", "nfs_trails", "poi", "corridors")
$tcArgs = @("tippecanoe", "-o", "/data/tiles/$Region.pmtiles", "--force",
  "-z$MaxZoom", "-Z$MinZoom", "--drop-densest-as-needed", "--simplification=4",
  "--no-tile-size-limit")

foreach ($l in $layers) {
  if (Test-Path "$inputDir/$l.geojson") {
    $tcArgs += @("-L", "${l}:/data/raw/tile_input/$l.geojson")
  }
}

Write-Host "==> Running tippecanoe (Docker: felt/tippecanoe)" -ForegroundColor Cyan
docker run --rm -v "${dataDir}:/data" felt/tippecanoe @tcArgs

Copy-Item "$dataDir/tiles/$Region.pmtiles" "$tilesOut/$Region.pmtiles" -Force
Write-Host "==> Wrote $tilesOut/$Region.pmtiles" -ForegroundColor Green
