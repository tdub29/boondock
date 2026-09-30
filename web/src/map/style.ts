import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { SRC, LYR, type BasemapId } from "./ids";

// All basemaps are key-free public tile services. The DEM source powers both the
// hillshade layer and optional 3D terrain (MapLibre `setTerrain`).

const TERRARIUM_ATTR = "Terrain: Mapzen / AWS Open Data";

export const BASEMAPS: { id: BasemapId; label: string; sublabel: string }[] = [
  { id: "satellite", label: "Satellite", sublabel: "ESRI World Imagery" },
  { id: "clarity", label: "Clarity", sublabel: "ESRI hi-res / recent" },
  { id: "imageryTopo", label: "Hybrid", sublabel: "Imagery + labels" },
  { id: "topo", label: "Topo", sublabel: "USGS topographic" },
  { id: "streets", label: "Streets", sublabel: "OpenStreetMap" },
  { id: "paper", label: "Paper", sublabel: "Hand-drawn watercolor" },
];

// --- "Paper" palette -------------------------------------------------------
// Warm rag-paper ground, two washes (sage green for vegetation, dusty violet for
// relief and protected land), water in a greyed teal, and every line and label in
// a red-brown ink so nothing on the sheet reads as pure black.
const PAPER = {
  ground: "#f3e9d6",
  groundDeep: "#ece0c8",
  wash: "#b9c6a2",
  washPale: "#d4d8b6",
  washScrub: "#cbcfa9",
  rock: "#d9cfba",
  violet: "#bfb2cc",
  violetDeep: "#8d7fa3",
  water: "#a7c0c2",
  waterInk: "#6f9096",
  ink: "#8a4b33",
  inkPale: "#b07a5e",
  text: "#6b4a34",
  textHalo: "#f7efdf",
} as const;

// fonts.openmaptiles.org carries Open Sans and Metropolis only. Every `Noto Serif`
// stack on that host silently falls back to a default face rather than 404ing, so
// the italic serif in the reference map is not reachable key-free. Open Sans Italic
// is the closest real italic there; see docs/kyle-aster-tweet-applied-2026-09-23.md.
const FONT_ITALIC = ["Open Sans Italic"];
const FONT_ITALIC_LIGHT = ["Open Sans Light Italic"];
const FONT_ITALIC_BOLD = ["Open Sans Semibold Italic"];

/** Sprite base url. Vite `base` is relative, so resolve against the document. */
function spriteUrl(): string {
  const base = typeof document !== "undefined" ? document.baseURI : "/";
  return new URL("paper-sprite", base).href;
}

const ROAD_CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"];

/**
 * The "Paper" basemap, hand-authored against the OpenMapTiles schema.
 *
 * Every layer is listed in `PAPER_LAYERS` (ids.ts) in this same order, because the
 * basemap switcher shows and hides the whole group. Drawn bottom to top: paper
 * ground, a violet relief wash, vegetation, water, ink line work, then labels.
 */
function paperLayers(visibility: "visible" | "none"): LayerSpecification[] {
  const layout = { visibility } as const;

  return [
    {
      id: LYR.paperBackground,
      type: "background",
      layout,
      paint: { "background-color": PAPER.ground },
    },
    {
      // Paper's own relief. Violet in the shadows and a bare warm highlight is what
      // reads as a wash rather than as shading; the shared LYR.hillshade toggle keeps
      // its neutral ramp for the imagery basemaps.
      id: LYR.paperHillshade,
      type: "hillshade",
      source: SRC.terrain,
      layout,
      paint: {
        "hillshade-exaggeration": 0.32,
        "hillshade-shadow-color": PAPER.violetDeep,
        "hillshade-highlight-color": "#fdf6e6",
        "hillshade-accent-color": "#7e9166",
        "hillshade-illumination-direction": 315,
      },
    },
    {
      id: LYR.paperLandcoverGrass,
      type: "fill",
      source: SRC.paper,
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["grass", "farmland"], true, false],
      layout,
      paint: { "fill-color": PAPER.washPale, "fill-opacity": 0.4 },
    },
    {
      id: LYR.paperLandcoverScrub,
      type: "fill",
      source: SRC.paper,
      "source-layer": "landcover",
      filter: ["match", ["get", "subclass"], ["scrub", "heath", "shrubbery", "garrigue"], true, false],
      layout,
      paint: { "fill-color": PAPER.washScrub, "fill-opacity": 0.45 },
    },
    {
      id: LYR.paperLandcoverRock,
      type: "fill",
      source: SRC.paper,
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["rock", "sand", "ice"], true, false],
      layout,
      paint: { "fill-color": PAPER.rock, "fill-opacity": 0.55 },
    },
    {
      // National forest, wilderness, park. The violet wash is what tells you at a
      // glance that the land under you is public, before any overlay is switched on.
      id: LYR.paperPark,
      type: "fill",
      source: SRC.paper,
      "source-layer": "park",
      layout,
      paint: { "fill-color": PAPER.violet, "fill-opacity": 0.22 },
    },
    {
      id: LYR.paperParkOutline,
      type: "line",
      source: SRC.paper,
      "source-layer": "park",
      layout: { ...layout, "line-join": "round" },
      paint: {
        "line-color": PAPER.violetDeep,
        "line-opacity": 0.5,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 14, 1.2],
        "line-dasharray": [4, 2.5],
      },
    },
    {
      id: LYR.paperLanduse,
      type: "fill",
      source: SRC.paper,
      "source-layer": "landuse",
      filter: ["match", ["get", "class"], ["residential", "commercial", "industrial", "quarry", "military"], true, false],
      layout,
      paint: { "fill-color": PAPER.groundDeep, "fill-opacity": 0.75 },
    },
    {
      id: LYR.paperLandcoverWood,
      type: "fill",
      source: SRC.paper,
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["wood"], true, false],
      layout,
      paint: { "fill-color": PAPER.wash, "fill-opacity": 0.5 },
    },
    {
      // MapLibre cannot scatter point symbols inside a polygon, so the conifers are
      // a seamless fill-pattern baked by web/scripts/make-paper-sprite.py.
      id: LYR.paperWoodTrees,
      type: "fill",
      source: SRC.paper,
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["wood"], true, false],
      minzoom: 7,
      layout,
      paint: {
        "fill-pattern": "paper-trees",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 9, 0.55, 14, 0.8],
      },
    },
    {
      id: LYR.paperWater,
      type: "fill",
      source: SRC.paper,
      "source-layer": "water",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      layout,
      paint: { "fill-color": PAPER.water, "fill-opacity": 0.85 },
    },
    {
      id: LYR.paperWaterway,
      type: "line",
      source: SRC.paper,
      "source-layer": "waterway",
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": PAPER.waterInk,
        "line-opacity": 0.75,
        "line-width": [
          "interpolate",
          ["exponential", 1.4],
          ["zoom"],
          8,
          ["match", ["get", "class"], ["river"], 0.9, 0.35],
          16,
          ["match", ["get", "class"], ["river"], 3.4, 1.4],
        ],
      },
    },
    {
      // A paper-colored casing, not a dark one: the road looks cut out of the wash.
      id: LYR.paperRoadCasing,
      type: "line",
      source: SRC.paper,
      "source-layer": "transportation",
      filter: ["match", ["get", "class"], ROAD_CLASSES, true, false],
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": PAPER.ground,
        "line-width": [
          "interpolate",
          ["exponential", 1.5],
          ["zoom"],
          7,
          ["match", ["get", "class"], ["motorway", "trunk"], 2.6, ["primary"], 2.0, 1.2],
          16,
          ["match", ["get", "class"], ["motorway", "trunk"], 9, ["primary"], 7.5, ["secondary", "tertiary"], 6, 4],
        ],
      },
    },
    {
      id: LYR.paperRoad,
      type: "line",
      source: SRC.paper,
      "source-layer": "transportation",
      filter: ["match", ["get", "class"], ROAD_CLASSES, true, false],
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "class"], ["motorway", "trunk", "primary"], PAPER.ink, PAPER.inkPale],
        "line-width": [
          "interpolate",
          ["exponential", 1.5],
          ["zoom"],
          7,
          ["match", ["get", "class"], ["motorway", "trunk"], 1.1, ["primary"], 0.8, 0.35],
          16,
          ["match", ["get", "class"], ["motorway", "trunk"], 4.2, ["primary"], 3.4, ["secondary", "tertiary"], 2.6, 1.5],
        ],
      },
    },
    {
      id: LYR.paperTrack,
      type: "line",
      source: SRC.paper,
      "source-layer": "transportation",
      filter: ["match", ["get", "class"], ["track", "raceway"], true, false],
      minzoom: 11,
      layout: { ...layout, "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": PAPER.inkPale,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 16, 1.6],
        "line-dasharray": [3, 2],
      },
    },
    {
      id: LYR.paperPath,
      type: "line",
      source: SRC.paper,
      "source-layer": "transportation",
      filter: ["match", ["get", "class"], ["path"], true, false],
      minzoom: 12,
      layout: { ...layout, "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": PAPER.ink,
        "line-opacity": 0.8,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 1.5],
        "line-dasharray": [1, 2.2],
      },
    },
    {
      id: LYR.paperBoundary,
      type: "line",
      source: SRC.paper,
      "source-layer": "boundary",
      // `<=` throws at render time if the field is absent, so assert the number with
      // a fallback rather than trusting every tile to carry admin_level.
      filter: ["all", ["<=", ["number", ["get", "admin_level"], 99], 6], ["!=", ["get", "maritime"], 1]],
      layout: { ...layout, "line-join": "round" },
      paint: {
        "line-color": PAPER.violetDeep,
        "line-opacity": 0.55,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 12, 1.8],
        "line-dasharray": [6, 2, 1.5, 2],
      },
    },
    {
      id: LYR.paperWaterLabel,
      type: "symbol",
      source: SRC.paper,
      "source-layer": "water_name",
      layout: {
        ...layout,
        "text-field": ["get", "name"],
        "text-font": FONT_ITALIC_LIGHT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 15, 15],
        "text-letter-spacing": 0.12,
        "text-max-width": 7,
      },
      paint: {
        "text-color": PAPER.waterInk,
        "text-halo-color": PAPER.textHalo,
        "text-halo-width": 1.1,
      },
    },
    {
      id: LYR.paperRoadLabel,
      type: "symbol",
      source: SRC.paper,
      "source-layer": "transportation_name",
      minzoom: 12,
      layout: {
        ...layout,
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name"], ["get", "ref"]],
        "text-font": FONT_ITALIC,
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9, 16, 12],
        "text-rotation-alignment": "map",
        "text-padding": 4,
      },
      paint: {
        "text-color": PAPER.ink,
        "text-halo-color": PAPER.textHalo,
        "text-halo-width": 1.4,
      },
    },
    {
      id: LYR.paperPeak,
      type: "circle",
      source: SRC.paper,
      "source-layer": "mountain_peak",
      filter: ["match", ["get", "class"], ["peak", "volcano"], true, false],
      minzoom: 8,
      layout,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 1.2, 14, 2.4],
        "circle-color": PAPER.text,
        "circle-opacity": 0.8,
      },
    },
    {
      // Name over elevation in feet, the way a paper topo prints a summit. ele_ft
      // ships in the OpenMapTiles mountain_peak layer, so nothing is converted here.
      id: LYR.paperPeakLabel,
      type: "symbol",
      source: SRC.paper,
      "source-layer": "mountain_peak",
      // Unnamed summits are filtered out here rather than coalesced to "", because
      // `concat` throws on a null name and an empty label is not worth the halo.
      filter: ["all", ["has", "name"], ["match", ["get", "class"], ["peak", "volcano"], true, false]],
      minzoom: 8,
      layout: {
        ...layout,
        "text-field": [
          "case",
          ["has", "ele_ft"],
          ["concat", ["get", "name"], "\n", ["to-string", ["get", "ele_ft"]], "'"],
          ["get", "name"],
        ],
        "text-font": FONT_ITALIC,
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 10, 14, 13],
        "text-anchor": "left",
        "text-offset": [0.6, 0],
        "text-max-width": 9,
        "text-optional": true,
      },
      paint: {
        "text-color": PAPER.text,
        "text-halo-color": PAPER.textHalo,
        "text-halo-width": 1.4,
      },
    },
    {
      id: LYR.paperPlaceLabel,
      type: "symbol",
      source: SRC.paper,
      "source-layer": "place",
      filter: ["match", ["get", "class"], ["city", "town", "village", "hamlet", "suburb"], true, false],
      layout: {
        ...layout,
        "text-field": ["get", "name"],
        "text-font": FONT_ITALIC_BOLD,
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6,
          ["match", ["get", "class"], ["city"], 13, ["town"], 11, 9],
          14,
          ["match", ["get", "class"], ["city"], 21, ["town"], 17, 14],
        ],
        "text-letter-spacing": 0.06,
        "text-max-width": 8,
      },
      paint: {
        "text-color": PAPER.text,
        "text-halo-color": PAPER.textHalo,
        "text-halo-width": 1.6,
      },
    },
  ];
}

export function baseStyle(initial: BasemapId): StyleSpecification {
  const vis = (id: BasemapId) => (id === initial ? "visible" : "none");

  return {
    version: 8,
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sprite: spriteUrl(),
    sources: {
      [SRC.topo]: {
        type: "raster",
        tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 16,
        attribution: "USGS The National Map",
      },
      [SRC.imageryTopo]: {
        type: "raster",
        tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 16,
        attribution: "USGS The National Map",
      },
      [SRC.satellite]: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Esri, Maxar, Earthstar Geographics",
      },
      [SRC.clarity]: {
        type: "raster",
        tiles: ["https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Esri Clarity, Maxar, Earthstar Geographics",
      },
      [SRC.streets]: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 20,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
      // Transparent reference overlays (roads/highways + place labels) that sit on
      // top of imagery so the road network is legible over satellite. Key-free.
      [SRC.roads]: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Esri, HERE, Garmin",
      },
      [SRC.roadLabels]: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Esri",
      },
      // The one vector source. TileJSON 3.0.0, OpenMapTiles schema, key-free.
      // Point at the TileJSON, never the date-stamped tile path inside it.
      [SRC.paper]: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution: "© OpenStreetMap contributors, OpenFreeMap, OpenMapTiles",
      },
      [SRC.terrain]: {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 14,
        attribution: TERRARIUM_ATTR,
      },
    },
    layers: [
      { id: LYR.topo, type: "raster", source: SRC.topo, layout: { visibility: vis("topo") } },
      { id: LYR.imageryTopo, type: "raster", source: SRC.imageryTopo, layout: { visibility: vis("imageryTopo") } },
      { id: LYR.satellite, type: "raster", source: SRC.satellite, layout: { visibility: vis("satellite") } },
      { id: LYR.clarity, type: "raster", source: SRC.clarity, layout: { visibility: vis("clarity") } },
      { id: LYR.streets, type: "raster", source: SRC.streets, layout: { visibility: vis("streets") } },
      // The vector basemap. Sits above the raster ones (only ever one group is
      // visible) and below the reference overlays and the data layers.
      ...paperLayers(vis("paper")),
      // Roads overlay renders above the basemap but below the data overlays (added
      // on load). Visibility is driven by the "roads" overlay toggle, not the basemap.
      { id: LYR.roads, type: "raster", source: SRC.roads, layout: { visibility: "none" }, paint: { "raster-opacity": 0.9 } },
      { id: LYR.roadLabels, type: "raster", source: SRC.roadLabels, layout: { visibility: "none" } },
      {
        id: LYR.hillshade,
        type: "hillshade",
        source: SRC.terrain,
        layout: { visibility: "none" },
        paint: {
          "hillshade-exaggeration": 0.45,
          "hillshade-shadow-color": "#2a2a22",
          "hillshade-accent-color": "#3a4a35",
        },
      },
    ],
  };
}
