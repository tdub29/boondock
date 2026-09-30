// Live federal ArcGIS REST endpoints. Verified key-free + CORS-enabled for the
// dev origin. If a service URL/field ever changes, fix it HERE — nothing else
// hardcodes these.
import { SRC } from "./ids";

export interface ArcGISLayerSource {
  /** Unique source config id. Multiple configs may feed the same app layer. */
  id: string;
  /** App-internal key. */
  key: "ownership" | "wilderness" | "mvumRoads" | "mvumTrails" | "blmRoads" | "campgrounds" | "trails" | "poi";
  /** Target MapLibre GeoJSON source id this feeds. */
  targetSource: string;
  /** ArcGIS REST `.../MapServer/<layerId>` (queryable). */
  serviceUrl: string;
  /** Fields to request (kept lean to limit payload). */
  outFields: string[];
  /** Optional attribute filter (defaults to 1=1). */
  where?: string;
  /** Below this zoom we don't query (viewport too large → too many features). */
  minZoom: number;
  /** Per-page fetch size; ArcGIS services still enforce their own maxRecordCount. */
  maxRecords?: number;
  geometry: "polygon" | "line" | "point";
  attribution: string;
  campground?: {
    agency: "USFS" | "BLM" | "CA State Parks" | "WA State Parks";
    sourceLabel: string;
    placeKind: "campground" | "campsite";
    nameFields: string[];
    areaFields?: string[];
    typeFields?: string[];
    detailFields?: string[];
    urlFields?: string[];
    reservationUrl?: string;
  };
  /** Named-natural-POI sources (peaks / lakes / trailheads) merged into one layer. */
  poi?: {
    kind: "peak" | "lake" | "trailhead";
    sourceLabel: string;
    nameFields: string[];
  };
}

export const OWNERSHIP_AGENCY_FIELD = "ADMIN_AGENCY_CODE";
export const OWNERSHIP_UNIT_FIELD = "ADMIN_UNIT_NAME";

export const ARCGIS_SOURCES: ArcGISLayerSource[] = [
  {
    id: "blm-sma-ownership",
    key: "ownership",
    targetSource: SRC.ownership,
    serviceUrl: "https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_LimitedScale/MapServer/1",
    outFields: [OWNERSHIP_AGENCY_FIELD, "ADMIN_DEPT_CODE", OWNERSHIP_UNIT_FIELD, "ADMIN_ST"],
    minZoom: 9,
    geometry: "polygon",
    attribution: "BLM National Surface Management Agency",
  },
  {
    id: "usfs-wilderness",
    key: "wilderness",
    targetSource: SRC.wilderness,
    serviceUrl: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_Wilderness_01/MapServer/0",
    outFields: ["*"],
    minZoom: 7,
    geometry: "polygon",
    attribution: "USFS National Wilderness Areas",
  },
  {
    id: "usfs-mvum-roads",
    key: "mvumRoads",
    targetSource: SRC.mvumRoads,
    serviceUrl: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1",
    outFields: [
      "name",
      "id",
      "mvum_symbol_name",
      "operationalmaintlevel",
      "surfacetype",
      "seasonal",
      "passengervehicle",
      "passengervehicle_datesopen",
      "highclearancevehicle",
      "highclearancevehicle_datesopen",
      "forestname",
      "districtname",
    ],
    minZoom: 11,
    geometry: "line",
    attribution: "USFS Motor Vehicle Use Map",
  },
  {
    id: "usfs-mvum-trails",
    key: "mvumTrails",
    targetSource: SRC.mvumTrails,
    serviceUrl: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/2",
    outFields: [
      "name",
      "id",
      "mvum_symbol_name",
      "seasonal",
      "atv",
      "motorcycle",
      "highclearancevehicle",
      "highclearancevehicle_datesopen",
      "forestname",
      "districtname",
    ],
    minZoom: 11,
    geometry: "line",
    attribution: "USFS Motor Vehicle Use Map",
  },
  {
    id: "blm-gtlf-roads",
    key: "blmRoads",
    targetSource: SRC.blmRoads,
    serviceUrl: "https://gis.blm.gov/arcgis/rest/services/transportation/BLM_Natl_GTLF_Public_Display/MapServer/0",
    // The last three are the seasonal restriction; see blmSeason() in legality/season.ts.
    outFields: ["ROUTE_PRMRY_NM", "OBSRVE_SRFCE_TYPE", "ADMIN_ST", "PLAN_SEASON_RSTRCT_CODE", "OHV_ROUTE_DSGNTN_LIM", "OHV_DSGNTN_LIM_EXPLAIN"],
    minZoom: 11,
    geometry: "line",
    attribution: "BLM Ground Transportation Linear Features",
  },
  {
    // Non-motorized foot/hiking trails. Distinct from EDW_MVUM (motorized OHV);
    // this is the full National Forest System Trails layer.
    id: "usfs-nfs-trails",
    key: "trails",
    targetSource: SRC.trails,
    serviceUrl: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0",
    outFields: ["trail_name", "trail_no", "trail_class", "trail_surface", "national_trail_designation", "hiker_pedestrian_managed"],
    minZoom: 11,
    geometry: "line",
    attribution: "USFS National Forest System Trails",
  },
  {
    id: "usfs-rec-campgrounds",
    key: "campgrounds",
    targetSource: SRC.campgrounds,
    serviceUrl: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0",
    outFields: ["site_name", "site_subtype", "recarea_name"],
    where: "site_subtype IN ('CAMPGROUND','CAMPING AREA','GROUP CAMPGROUND','HORSE CAMP')",
    minZoom: 9,
    geometry: "point",
    attribution: "USFS Recreation Sites",
    campground: {
      agency: "USFS",
      sourceLabel: "USFS recreation sites",
      placeKind: "campground",
      nameFields: ["site_name"],
      areaFields: ["recarea_name"],
      typeFields: ["site_subtype"],
      reservationUrl: "https://www.recreation.gov/search?entity_type=campground",
    },
  },
  {
    id: "blm-rec-campgrounds",
    key: "campgrounds",
    targetSource: SRC.campgrounds,
    serviceUrl: "https://gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recs_pts/MapServer/2",
    outFields: ["OBJECTID", "FET_NAME", "FET_SUBTYPE", "DESCRIPTION", "WEB_LINK", "ADMIN_ST"],
    minZoom: 8,
    geometry: "point",
    attribution: "BLM Recreation Points",
    campground: {
      agency: "BLM",
      sourceLabel: "BLM recreation points",
      placeKind: "campground",
      nameFields: ["FET_NAME"],
      typeFields: ["FET_SUBTYPE"],
      detailFields: ["DESCRIPTION"],
      urlFields: ["WEB_LINK"],
      reservationUrl: "https://www.recreation.gov/search?entity_type=campground",
    },
  },
  {
    id: "blm-developed-campsites",
    key: "campgrounds",
    targetSource: SRC.campgrounds,
    serviceUrl: "https://gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recs_pts/MapServer/3",
    outFields: ["OBJECTID", "FET_NAME", "FET_SUBTYPE", "DESCRIPTION", "WEB_LINK", "ADMIN_ST"],
    minZoom: 10,
    geometry: "point",
    attribution: "BLM Recreation Points",
    campground: {
      agency: "BLM",
      sourceLabel: "BLM developed campsites",
      placeKind: "campsite",
      nameFields: ["FET_NAME"],
      typeFields: ["FET_SUBTYPE"],
      detailFields: ["DESCRIPTION"],
      urlFields: ["WEB_LINK"],
      reservationUrl: "https://www.recreation.gov/search?entity_type=campground",
    },
  },
  {
    id: "blm-primitive-campsites",
    key: "campgrounds",
    targetSource: SRC.campgrounds,
    serviceUrl: "https://gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recs_pts/MapServer/4",
    outFields: ["OBJECTID", "FET_NAME", "FET_SUBTYPE", "DESCRIPTION", "WEB_LINK", "ADMIN_ST"],
    minZoom: 10,
    geometry: "point",
    attribution: "BLM Recreation Points",
    campground: {
      agency: "BLM",
      sourceLabel: "BLM primitive campsites",
      placeKind: "campsite",
      nameFields: ["FET_NAME"],
      typeFields: ["FET_SUBTYPE"],
      detailFields: ["DESCRIPTION"],
      urlFields: ["WEB_LINK"],
      reservationUrl: "https://www.recreation.gov/search?entity_type=campground",
    },
  },
  {
    id: "ca-state-campgrounds",
    key: "campgrounds",
    targetSource: SRC.campgrounds,
    serviceUrl: "https://services2.arcgis.com/AhxrK3F6WM8ECvDi/arcgis/rest/services/Campgrounds/FeatureServer/0",
    outFields: ["FID", "Campground", "TYPE", "SUBTYPE", "DETAIL", "UNITNAME", "WHAT3WORD_ADDRESS"],
    minZoom: 7,
    geometry: "point",
    attribution: "California State Parks Campgrounds",
    campground: {
      agency: "CA State Parks",
      sourceLabel: "California State Parks",
      placeKind: "campground",
      nameFields: ["Campground"],
      areaFields: ["UNITNAME"],
      typeFields: ["TYPE", "SUBTYPE"],
      detailFields: ["DETAIL"],
      reservationUrl: "https://www.reservecalifornia.com/",
    },
  },
  {
    id: "wa-state-campsites",
    key: "campgrounds",
    targetSource: SRC.campgrounds,
    serviceUrl: "https://services5.arcgis.com/4LKAHwqnBooVDUlX/arcgis/rest/services/Campsites/FeatureServer/78",
    outFields: ["OBJECTID", "Name", "ParkName", "Filter", "SourceNotes", "ParkCode", "Keylink"],
    where: "Filter = 'active'",
    minZoom: 13,
    geometry: "point",
    attribution: "Washington State Parks Campsites",
    campground: {
      agency: "WA State Parks",
      sourceLabel: "Washington State Parks campsites",
      placeKind: "campsite",
      nameFields: ["Name"],
      areaFields: ["ParkName"],
      typeFields: ["Filter"],
      detailFields: ["SourceNotes"],
      urlFields: ["Keylink"],
      reservationUrl: "https://washington.goingtocamp.com/",
    },
  },
  {
    // Named summits/peaks from USGS GNIS (Geographic Names). Landforms layer,
    // filtered to the Summit feature class. Returns MultiPoint geometry.
    id: "gnis-summits",
    key: "poi",
    targetSource: SRC.poi,
    serviceUrl: "https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer/5",
    outFields: ["gaz_name", "gaz_featureclass"],
    where: "gaz_featureclass = 'Summit'",
    minZoom: 10,
    geometry: "point",
    attribution: "USGS GNIS (Geographic Names)",
    poi: { kind: "peak", sourceLabel: "USGS GNIS summit", nameFields: ["gaz_name"] },
  },
  {
    // Named lakes/reservoirs from USGS GNIS (hydrographic points).
    id: "gnis-lakes",
    key: "poi",
    targetSource: SRC.poi,
    serviceUrl: "https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer/7",
    outFields: ["gaz_name", "gaz_featureclass"],
    where: "gaz_featureclass IN ('Lake','Reservoir')",
    minZoom: 10,
    geometry: "point",
    attribution: "USGS GNIS (Geographic Names)",
    poi: { kind: "lake", sourceLabel: "USGS GNIS lake", nameFields: ["gaz_name"] },
  },
  {
    // Trailheads from the USFS INFRA recreation-sites service (same service as
    // campgrounds, filtered to the TRAILHEAD subtype).
    id: "usfs-trailheads",
    key: "poi",
    targetSource: SRC.poi,
    serviceUrl: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0",
    outFields: ["site_name", "site_subtype", "recarea_name"],
    where: "site_subtype = 'TRAILHEAD'",
    minZoom: 10,
    geometry: "point",
    attribution: "USFS Recreation Sites",
    poi: { kind: "trailhead", sourceLabel: "USFS trailhead", nameFields: ["site_name", "recarea_name"] },
  },
];

/** Build an ArcGIS GeoJSON bbox query URL for the current viewport.
 * `maxAllowableOffset` (in degrees, ~a couple screen px) generalizes geometry
 * server-side — essential for big polygons (a single BLM polygon can be 14 MB raw). */
export function buildQueryUrl(
  src: ArcGISLayerSource,
  bbox: [number, number, number, number],
  maxRecords = 2000,
  resultOffset = 0,
  maxAllowableOffset?: number,
): string {
  const params = new URLSearchParams({
    where: src.where ?? "1=1",
    geometry: bbox.join(","),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: src.outFields.join(","),
    returnGeometry: "true",
    geometryPrecision: "5",
    resultRecordCount: String(maxRecords),
    f: "geojson",
  });
  if (resultOffset > 0) {
    params.set("resultOffset", String(resultOffset));
  }
  if (maxAllowableOffset && src.geometry !== "point") {
    params.set("maxAllowableOffset", String(maxAllowableOffset));
  }
  return `${src.serviceUrl}/query?${params.toString()}`;
}

/**
 * The dataset a legality verdict is actually standing on. A verdict that cites
 * nothing reads as the app's own opinion; this makes the reader's next check
 * ("is that source current?") possible.
 */
export const OWNERSHIP_ATTRIBUTION =
  ARCGIS_SOURCES.find((s) => s.key === "ownership")?.attribution ?? "public-land ownership data";
