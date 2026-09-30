// Stable MapLibre source & layer ids, shared across style/layers/liveData/MapView
// so nothing drifts out of sync.

export const SRC = {
  // basemaps
  topo: "basemap-topo",
  satellite: "basemap-satellite",
  clarity: "basemap-clarity",
  imageryTopo: "basemap-imagery-topo",
  streets: "basemap-streets",
  // The one vector basemap: OpenMapTiles schema off OpenFreeMap, styled by hand.
  paper: "basemap-paper",
  roads: "overlay-roads",
  roadLabels: "overlay-road-labels",
  terrain: "terrain-dem",
  // overlays (live GeoJSON, online)
  ownership: "src-ownership",
  wilderness: "src-wilderness",
  mvumRoads: "src-mvum-roads",
  mvumTrails: "src-mvum-trails",
  blmRoads: "src-blm-roads",
  mvumSelected: "src-mvum-selected",
  mvumHover: "src-mvum-hover",
  corridors: "src-corridors",
  campgrounds: "src-campgrounds",
  trails: "src-trails",
  poi: "src-poi",
  // offline vector tiles (PMTiles)
  offline: "src-offline",
  // user data
  gps: "src-gps",
  track: "src-track",
  waypoints: "src-waypoints",
  route: "src-route",
  stops: "src-stops",
  searchPin: "src-search-pin",
} as const;

export const LYR = {
  // basemaps
  topo: "l-basemap-topo",
  satellite: "l-basemap-satellite",
  clarity: "l-basemap-clarity",
  imageryTopo: "l-basemap-imagery-topo",
  streets: "l-basemap-streets",
  // "Paper" hand-authored vector basemap. Many layers, one basemap, drawn bottom
  // to top in this order. Its hillshade is its own so the watercolor ramp does not
  // fight the shared terrain toggle.
  paperBackground: "l-paper-background",
  paperHillshade: "l-paper-hillshade",
  paperLandcoverGrass: "l-paper-landcover-grass",
  paperLandcoverScrub: "l-paper-landcover-scrub",
  paperLandcoverRock: "l-paper-landcover-rock",
  paperPark: "l-paper-park",
  paperParkOutline: "l-paper-park-outline",
  paperLanduse: "l-paper-landuse",
  paperLandcoverWood: "l-paper-landcover-wood",
  paperWoodTrees: "l-paper-wood-trees",
  paperWater: "l-paper-water",
  paperWaterway: "l-paper-waterway",
  paperRoadCasing: "l-paper-road-casing",
  paperRoad: "l-paper-road",
  paperTrack: "l-paper-track",
  paperPath: "l-paper-path",
  paperBoundary: "l-paper-boundary",
  paperWaterLabel: "l-paper-water-label",
  paperRoadLabel: "l-paper-road-label",
  paperPeak: "l-paper-peak",
  paperPeakLabel: "l-paper-peak-label",
  paperPlaceLabel: "l-paper-place-label",
  roads: "l-overlay-roads",
  roadLabels: "l-overlay-road-labels",
  hillshade: "l-hillshade",
  // overlays
  ownershipFill: "l-ownership-fill",
  ownershipLine: "l-ownership-line",
  ownershipLabel: "l-ownership-label",
  corridorsFill: "l-corridors-fill",
  corridorsLine: "l-corridors-line",
  wildernessFill: "l-wilderness-fill",
  wildernessLine: "l-wilderness-line",
  campgrounds: "l-campgrounds",
  campgroundsLabel: "l-campgrounds-label",
  campgroundsHit: "l-campgrounds-hit",
  mvumTrailsCasing: "l-mvum-trails-casing",
  mvumTrails: "l-mvum-trails",
  mvumRoadsCasing: "l-mvum-roads-casing",
  mvumRoads: "l-mvum-roads",
  mvumRoadsLabel: "l-mvum-roads-label",
  mvumHighlight: "l-mvum-highlight",
  mvumHover: "l-mvum-hover",
  mvumHoverPoint: "l-mvum-hover-point",
  mvumRoadsHit: "l-mvum-roads-hit",
  mvumTrailsHit: "l-mvum-trails-hit",
  blmRoadsCasing: "l-blm-roads-casing",
  blmRoads: "l-blm-roads",
  blmRoadsLabel: "l-blm-roads-label",
  blmRoadsHit: "l-blm-roads-hit",
  trailsCasing: "l-trails-casing",
  trails: "l-trails",
  trailsLabel: "l-trails-label",
  poi: "l-poi",
  poiLabel: "l-poi-label",
  // offline equivalents
  offlineOwnershipFill: "l-offline-ownership-fill",
  offlineCorridors: "l-offline-corridors",
  offlineRoutes: "l-offline-routes",
  // user data
  trackLine: "l-track-line",
  routeCasing: "l-route-casing",
  route: "l-route",
  routeBackroad: "l-route-backroad",
  routeGap: "l-route-gap",
  waypoints: "l-waypoints",
  gpsAccuracy: "l-gps-accuracy",
  gpsDot: "l-gps-dot",
  gpsHeading: "l-gps-heading",
  stopsDot: "l-stops-dot",
  stopsLabel: "l-stops-label",
  searchPinDot: "l-search-pin-dot",
  searchPinLabel: "l-search-pin-label",
} as const;

export type BasemapId = "topo" | "satellite" | "clarity" | "imageryTopo" | "streets" | "paper";

/** Every layer the "Paper" basemap owns, bottom to top. Draw order is this order. */
export const PAPER_LAYERS = [
  LYR.paperBackground,
  LYR.paperHillshade,
  LYR.paperLandcoverGrass,
  LYR.paperLandcoverScrub,
  LYR.paperLandcoverRock,
  LYR.paperPark,
  LYR.paperParkOutline,
  LYR.paperLanduse,
  LYR.paperLandcoverWood,
  LYR.paperWoodTrees,
  LYR.paperWater,
  LYR.paperWaterway,
  LYR.paperRoadCasing,
  LYR.paperRoad,
  LYR.paperTrack,
  LYR.paperPath,
  LYR.paperBoundary,
  LYR.paperWaterLabel,
  LYR.paperRoadLabel,
  LYR.paperPeak,
  LYR.paperPeakLabel,
  LYR.paperPlaceLabel,
] as const;

/**
 * A basemap is a GROUP of layers, not one layer. The five raster basemaps happen to
 * be one each; Paper is twenty-two. Switching shows one group and hides the rest.
 */
export const BASEMAP_LAYER_GROUPS: Record<BasemapId, readonly string[]> = {
  topo: [LYR.topo],
  satellite: [LYR.satellite],
  clarity: [LYR.clarity],
  imageryTopo: [LYR.imageryTopo],
  streets: [LYR.streets],
  paper: PAPER_LAYERS,
};

export const BASEMAP_IDS = Object.keys(BASEMAP_LAYER_GROUPS) as BasemapId[];

/** Toggleable overlay groups surfaced in the LayerPanel. */
export type OverlayId =
  | "roads"
  | "corridors"
  | "campgrounds"
  | "ownership"
  | "wilderness"
  | "mvumRoads"
  | "mvumTrails"
  | "blmRoads"
  | "trails"
  | "poi"
  | "hillshade";
