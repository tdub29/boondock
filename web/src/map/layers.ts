import type { Map as MLMap, ExpressionSpecification } from "maplibre-gl";
import { SRC, LYR } from "./ids";
import { managerColorExpression } from "./managers";

const EMPTY = { type: "FeatureCollection", features: [] as never[] } as const;

// A route outside its open season today (`season`, stamped in liveData.ts).
// A hue, not a fade: line opacity already belongs to the road-opacity slider.
export const SEASON_CLOSED_COLOR = "#7d858a";
// Its MVUM dates could not be read, or the BLM flags it seasonal with no dates,
// so it may be closed: verify before driving in.
export const SEASON_UNKNOWN_COLOR = "#c9a227";

// MVUM road color by motorized openness (derived from the `passengervehicle` field).
const mvumRoadColor: ExpressionSpecification = [
  "case",
  ["==", ["get", "season"], "closed"],
  SEASON_CLOSED_COLOR, // closed for the season today (slate)
  ["==", ["get", "season"], "unknown"],
  SEASON_UNKNOWN_COLOR, // season dates unreadable (mustard)
  ["==", ["get", "passengervehicle"], "open"],
  "#4AA3F0", // open to all vehicles (bright blue)
  "#2D6BB8", // high-clearance / restricted (deep blue)
];

const campgroundColor: ExpressionSpecification = [
  "match",
  ["get", "agency"],
  "USFS",
  "#f1d59a",
  "BLM",
  "#e0a93b",
  "CA State Parks",
  "#77c7e8",
  "WA State Parks",
  "#94d37b",
  "#f1d59a",
];

// Named-POI marker color by kind: rock/tan peak, water blue lake, trail green trailhead.
const poiColor: ExpressionSpecification = [
  "match",
  ["get", "poiKind"],
  "peak",
  "#d8c3a5",
  "lake",
  "#5aa9e0",
  "trailhead",
  "#5fbf74",
  "#d8c3a5",
];

/** Add all overlay GeoJSON sources + styled layers once, on map `load`. */
export function addOverlayLayers(map: MLMap): void {
  for (const id of [
    SRC.ownership,
    SRC.wilderness,
    SRC.corridors,
    SRC.mvumRoads,
    SRC.mvumTrails,
    SRC.blmRoads,
    SRC.mvumSelected,
    SRC.mvumHover,
    SRC.campgrounds,
    SRC.trails,
    SRC.poi,
    SRC.track,
    SRC.route,
    SRC.stops,
    SRC.searchPin,
    SRC.waypoints,
    SRC.gps,
  ]) {
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: EMPTY as never });
  }

  // --- Land ownership (under everything) ---
  map.addLayer({
    id: LYR.ownershipFill,
    type: "fill",
    source: SRC.ownership,
    paint: {
      "fill-color": managerColorExpression("manager") as ExpressionSpecification,
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        ["case", ["==", ["get", "manager"], "PRIVATE"], 0.05, 0.28],
        14,
        ["case", ["==", ["get", "manager"], "PRIVATE"], 0.04, 0.2],
      ],
    },
  });
  map.addLayer({
    id: LYR.ownershipLine,
    type: "line",
    source: SRC.ownership,
    paint: {
      "line-color": managerColorExpression("manager") as ExpressionSpecification,
      "line-opacity": 0.9,
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 2],
    },
  });

  // --- Likely-legal dispersed camping corridors (computed live; the headline layer) ---
  map.addLayer({
    id: LYR.corridorsFill,
    type: "fill",
    source: SRC.corridors,
    paint: { "fill-color": "#3ad06a", "fill-opacity": 0.3 },
  });
  map.addLayer({
    id: LYR.corridorsLine,
    type: "line",
    source: SRC.corridors,
    paint: { "line-color": "#39d96f", "line-opacity": 0.65, "line-width": 1 },
  });

  // --- Wilderness (motorized + dispersed prohibited): a clear red no-go ---
  map.addLayer({
    id: LYR.wildernessFill,
    type: "fill",
    source: SRC.wilderness,
    paint: { "fill-color": "#d0463a", "fill-opacity": 0.18 },
  });
  map.addLayer({
    id: LYR.wildernessLine,
    type: "line",
    source: SRC.wilderness,
    paint: { "line-color": "#e0594f", "line-opacity": 0.8, "line-width": 1.4, "line-dasharray": [3, 2] },
  });

  // --- Ownership labels (agency / unit name) ---
  map.addLayer({
    id: LYR.ownershipLabel,
    type: "symbol",
    source: SRC.ownership,
    minzoom: 9,
    filter: ["all", ["!=", ["get", "manager"], "PRIVATE"], ["!=", ["get", "manager"], "OTHER"]],
    layout: {
      "text-field": ["coalesce", ["get", "unit"], ["get", "mgrLabel"]],
      "text-font": ["Open Sans Semibold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 14, 13],
      "text-transform": "uppercase",
      "text-letter-spacing": 0.08,
      "text-max-width": 8,
      "symbol-placement": "point",
    },
    paint: {
      "text-color": "#f3f4ee",
      "text-halo-color": "#16201a",
      "text-halo-width": 1.6,
      "text-opacity": 0.85,
    },
  });

  // --- MVUM trails (dark casing + dashed OHV purple) ---
  map.addLayer({
    id: LYR.mvumTrailsCasing,
    type: "line",
    source: SRC.mvumTrails,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "rgba(20,28,22,0.85)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 16, 7],
    },
  });
  map.addLayer({
    id: LYR.mvumTrails,
    type: "line",
    source: SRC.mvumTrails,
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": [
        "case",
        ["==", ["get", "season"], "closed"],
        SEASON_CLOSED_COLOR,
        ["==", ["get", "season"], "unknown"],
        SEASON_UNKNOWN_COLOR,
        "#B57BD0",
      ],
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4],
      "line-dasharray": [2, 1.4],
    },
  });

  // --- MVUM roads (heavy white casing + bold access-colored line) ---
  map.addLayer({
    id: LYR.mvumRoadsCasing,
    type: "line",
    source: SRC.mvumRoads,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#f5f3ec",
      "line-opacity": 0.95,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 13, 6, 16, 11],
    },
  });
  map.addLayer({
    id: LYR.mvumRoads,
    type: "line",
    source: SRC.mvumRoads,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": mvumRoadColor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 13, 3.2, 16, 7],
    },
  });

  // --- BLM motorized roads (GTLF) — same styling as MVUM so roads read as one network ---
  map.addLayer({
    id: LYR.blmRoadsCasing,
    type: "line",
    source: SRC.blmRoads,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#f5f3ec",
      "line-opacity": 0.95,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 13, 6, 16, 11],
    },
  });
  map.addLayer({
    id: LYR.blmRoads,
    type: "line",
    source: SRC.blmRoads,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      // BLM roads carry passengervehicle "open", so this is bright blue unless the
      // BLM flags a seasonal restriction (season "unknown", mustard).
      "line-color": mvumRoadColor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 13, 3.2, 16, 7],
    },
  });

  // --- Hiking / foot trails (USFS NFS Trails): dashed clay line, dark casing. Distinct
  //     from the purple motorized OHV (mvumTrails) and blue motorized roads. ---
  map.addLayer({
    id: LYR.trailsCasing,
    type: "line",
    source: SRC.trails,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "rgba(20,28,22,0.75)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.6, 16, 5],
    },
  });
  map.addLayer({
    id: LYR.trails,
    type: "line",
    source: SRC.trails,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#EC7A3D",
      "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 16, 3],
      "line-dasharray": [1.5, 1.2],
    },
  });
  map.addLayer({
    id: LYR.trailsLabel,
    type: "symbol",
    source: SRC.trails,
    minzoom: 13,
    layout: {
      "symbol-placement": "line",
      "text-field": ["coalesce", ["get", "name"], ["get", "trailNo"]],
      "text-font": ["Open Sans Semibold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 12],
      "text-max-angle": 35,
      "symbol-spacing": 240,
      "text-optional": true,
    },
    paint: { "text-color": "#f7e3d0", "text-halo-color": "#2a1c0c", "text-halo-width": 1.4 },
  });

  // --- Hovered road/trail (set imperatively on mousemove) ---
  // Drawn under the tap highlight so a selection always reads as the stronger
  // of the two when the pointer happens to rest on the selected route.
  map.addLayer({
    id: LYR.mvumHover,
    type: "line",
    source: SRC.mvumHover,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffd76a",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 13, 6.5, 16, 11],
      "line-opacity": 0.85,
      "line-blur": 0.4,
    },
  });
  // Same source, point features: a campground or POI hovered from the results rail.
  map.addLayer({
    id: LYR.mvumHoverPoint,
    type: "circle",
    source: SRC.mvumHover,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 8, 14, 12],
      "circle-opacity": 0,
      "circle-stroke-color": "#ffd76a",
      "circle-stroke-width": 3,
    },
  });

  // --- Selected road/trail highlight (set imperatively on tap) ---
  map.addLayer({
    id: LYR.mvumHighlight,
    type: "line",
    source: SRC.mvumSelected,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#34e0ff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 13, 8, 16, 14],
      "line-opacity": 0.9,
      "line-blur": 0.5,
    },
  });

  // --- Route-number labels along roads ---
  map.addLayer({
    id: LYR.mvumRoadsLabel,
    type: "symbol",
    source: SRC.mvumRoads,
    minzoom: 12,
    layout: {
      "symbol-placement": "line",
      "text-field": ["coalesce", ["get", "id"], ["get", "name"]],
      "text-font": ["Open Sans Semibold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13],
      "text-max-angle": 35,
      "symbol-spacing": 220,
    },
    paint: {
      "text-color": "#2a1c0c",
      "text-halo-color": "#f5f3ec",
      "text-halo-width": 1.6,
    },
  });

  // --- Wide invisible hit lines so roads/trails are easy to tap ---
  map.addLayer({
    id: LYR.mvumRoadsHit,
    type: "line",
    source: SRC.mvumRoads,
    paint: { "line-color": "#000", "line-opacity": 0.01, "line-width": 26 },
  });
  map.addLayer({
    id: LYR.mvumTrailsHit,
    type: "line",
    source: SRC.mvumTrails,
    paint: { "line-color": "#000", "line-opacity": 0.01, "line-width": 24 },
  });
  map.addLayer({
    id: LYR.blmRoadsHit,
    type: "line",
    source: SRC.blmRoads,
    paint: { "line-color": "#000", "line-opacity": 0.01, "line-width": 26 },
  });
  map.addLayer({
    id: LYR.blmRoadsLabel,
    type: "symbol",
    source: SRC.blmRoads,
    minzoom: 12,
    layout: {
      "symbol-placement": "line",
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Semibold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13],
      "text-max-angle": 35,
      "symbol-spacing": 240,
    },
    paint: { "text-color": "#2a1c0c", "text-halo-color": "#f5f3ec", "text-halo-width": 1.6 },
  });

  // --- Campgrounds (developed rec sites) ---
  map.addLayer({
    id: LYR.campgrounds,
    type: "circle",
    source: SRC.campgrounds,
    minzoom: 7,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        7,
        ["case", ["==", ["get", "placeKind"], "campsite"], 2.6, 3.4],
        14,
        ["case", ["==", ["get", "placeKind"], "campsite"], 4.4, 6.2],
      ],
      "circle-color": campgroundColor,
      "circle-stroke-color": "#2a1c0c",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: LYR.campgroundsLabel,
    type: "symbol",
    source: SRC.campgrounds,
    minzoom: 12,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Semibold"],
      "text-size": 11,
      "text-offset": [0, 0.9],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": "#f7eccf", "text-halo-color": "#16201a", "text-halo-width": 1.4 },
  });
  map.addLayer({
    id: LYR.campgroundsHit,
    type: "circle",
    source: SRC.campgrounds,
    minzoom: 7,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 14, 14, 20],
      "circle-color": "#000",
      "circle-opacity": 0.01,
    },
  });

  // --- Named natural POIs: GNIS peaks + lakes, USFS trailheads (colored by kind) ---
  map.addLayer({
    id: LYR.poi,
    type: "circle",
    source: SRC.poi,
    minzoom: 10,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.6, 15, 4.8],
      "circle-color": poiColor,
      "circle-stroke-color": "#16201a",
      "circle-stroke-width": 1.3,
    },
  });
  map.addLayer({
    id: LYR.poiLabel,
    type: "symbol",
    source: SRC.poi,
    minzoom: 11,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Semibold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 15, 12],
      "text-offset": [0, 0.85],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": "#eef0e6", "text-halo-color": "#16201a", "text-halo-width": 1.3 },
  });

  // --- Recorded track ---
  map.addLayer({
    id: LYR.trackLine,
    type: "line",
    source: SRC.track,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#2E7DE4", "line-width": 4, "line-opacity": 0.9 },
  });

  // --- Drive route: solid casing+line for mapped roads, dashed for the estimated gap ---
  map.addLayer({
    id: LYR.routeCasing,
    type: "line",
    source: SRC.route,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#0b1f3a", "line-opacity": 0.5, "line-width": 8 },
  });
  map.addLayer({
    id: LYR.route,
    type: "line",
    source: SRC.route,
    filter: ["==", ["get", "seg"], "paved"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#3f8ae0", "line-width": 5 },
  });
  map.addLayer({
    id: LYR.routeBackroad,
    type: "line",
    source: SRC.route,
    filter: ["==", ["get", "seg"], "backroad"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#E4572E", "line-width": 5 },
  });
  map.addLayer({
    id: LYR.routeGap,
    type: "line",
    source: SRC.route,
    filter: ["==", ["get", "seg"], "gap"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#E0A93B", "line-width": 4, "line-dasharray": [1.5, 1.5] },
  });

  // --- Waypoints (camp pins) ---
  map.addLayer({
    id: LYR.waypoints,
    type: "circle",
    source: SRC.waypoints,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 16, 8],
      "circle-color": "#E0A93B",
      "circle-stroke-color": "#16241c",
      "circle-stroke-width": 2,
    },
  });

  // --- Trip stops (start / vias / end) — numbered pins along the planned route ---
  map.addLayer({
    id: LYR.stopsDot,
    type: "circle",
    source: SRC.stops,
    paint: {
      "circle-radius": 11,
      "circle-color": ["match", ["get", "kind"], "start", "#4caf6b", "end", "#f0a020", "#7c8a80"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });
  map.addLayer({
    id: LYR.stopsLabel,
    type: "symbol",
    source: SRC.stops,
    layout: {
      "text-field": ["get", "badge"],
      "text-font": ["Open Sans Semibold"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#12201a", "text-halo-color": "#ffffff", "text-halo-width": 0.6 },
  });

  // --- Dropped pin for a searched place / pasted coordinates ---
  map.addLayer({
    id: LYR.searchPinDot,
    type: "circle",
    source: SRC.searchPin,
    paint: {
      "circle-radius": 8,
      "circle-color": "#f0a020",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });
  map.addLayer({
    id: LYR.searchPinLabel,
    type: "symbol",
    source: SRC.searchPin,
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Open Sans Semibold"],
      "text-size": 11,
      "text-offset": [0, -1.4],
      "text-anchor": "bottom",
    },
    paint: { "text-color": "#ffd999", "text-halo-color": "#201a10", "text-halo-width": 1.5 },
  });

  // --- GPS: accuracy ring (polygon) + dot (point) live in the same source ---
  map.addLayer({
    id: LYR.gpsAccuracy,
    type: "fill",
    source: SRC.gps,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": "#2E7DE4", "fill-opacity": 0.12 },
  });
  map.addLayer({
    id: LYR.gpsDot,
    type: "circle",
    source: SRC.gps,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 7,
      "circle-color": "#2E7DE4",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5,
    },
  });
}

const OVERLAY_VISIBILITY: Record<string, string[]> = {
  roads: [LYR.roads, LYR.roadLabels],
  corridors: [LYR.corridorsFill, LYR.corridorsLine],
  campgrounds: [LYR.campgrounds, LYR.campgroundsLabel, LYR.campgroundsHit],
  ownership: [LYR.ownershipFill, LYR.ownershipLine, LYR.ownershipLabel],
  wilderness: [LYR.wildernessFill, LYR.wildernessLine],
  mvumRoads: [LYR.mvumRoadsCasing, LYR.mvumRoads, LYR.mvumRoadsLabel, LYR.mvumRoadsHit],
  mvumTrails: [LYR.mvumTrailsCasing, LYR.mvumTrails, LYR.mvumTrailsHit],
  blmRoads: [LYR.blmRoadsCasing, LYR.blmRoads, LYR.blmRoadsLabel, LYR.blmRoadsHit],
  trails: [LYR.trailsCasing, LYR.trails, LYR.trailsLabel],
  poi: [LYR.poi, LYR.poiLabel],
  hillshade: [LYR.hillshade],
};

export function setOverlayVisible(map: MLMap, overlay: string, visible: boolean): void {
  for (const lyr of OVERLAY_VISIBILITY[overlay] ?? []) {
    if (map.getLayer(lyr)) map.setLayoutProperty(lyr, "visibility", visible ? "visible" : "none");
  }
}

/**
 * Show or hide one basemap. A basemap is a GROUP of layer ids, not a single layer:
 * the raster basemaps are one each, "paper" is its whole hand-authored stack.
 */
export function setBasemapVisible(map: MLMap, layerIds: readonly string[], visible: boolean): void {
  for (const id of layerIds) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}
