import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MLMap, MapMouseEvent } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { circle, pointToLineDistance, buffer, bbox as turfBbox, length as turfLength } from "@turf/turf";
import type { Feature, FeatureCollection, LineString, MultiLineString } from "geojson";
import { baseStyle } from "./style";
import { SRC, LYR, BASEMAP_IDS, BASEMAP_LAYER_GROUPS, type BasemapId, type OverlayId } from "./ids";
import { SEASON_CLOSED_COLOR, SEASON_UNKNOWN_COLOR, addOverlayLayers, setBasemapVisible, setOverlayVisible } from "./layers";
import { LiveDataManager, type LayerKey, type LoadStatus } from "./liveData";
import { computeVerdict, type NearestRoute, type Verdict } from "../legality/verdict";
import { blmSeason, seasonOn } from "../legality/season";
import type { Manager } from "./managers";
import type { GpsFix } from "../gps/useGeolocation";
import type { CampgroundPlace } from "../campgrounds/types";
import { ResultsRail, RAIL_KINDS, railSwatchColor, type RailItem, type RailKind } from "../ui/ResultsRail";

const IMAGERY_LAYERS = [LYR.satellite, LYR.clarity, LYR.imageryTopo];

// Max camera pitch. Above MapLibre's public 85° limit — the mercator transform still
// renders cleanly to 88 (near-horizon look-up). Applied via the transform's private cap.
export const MAX_PITCH = 88;

// Overlay ids that are backed by a live ArcGIS layer (names match LayerKey).
const LIVE_OVERLAYS = new Set<OverlayId>(["ownership", "wilderness", "mvumRoads", "mvumTrails", "blmRoads", "campgrounds", "trails", "poi"]);

let pmtilesRegistered = false;
function ensurePmtiles() {
  if (pmtilesRegistered) return;
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  pmtilesRegistered = true;
}

export interface FlyTarget {
  bounds?: [number, number, number, number];
  center?: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  token: number;
}

interface Props {
  basemap: BasemapId;
  overlays: Record<OverlayId, boolean>;
  terrain3D: boolean;
  roadOpacity: number;
  sharpenImagery: boolean;
  gpsFix: GpsFix | null;
  follow: boolean;
  recenterToken: number;
  trackFC: FeatureCollection;
  waypointsFC: FeatureCollection;
  routeFC: FeatureCollection;
  stopsFC: FeatureCollection;
  searchPin: { lng: number; lat: number; label: string } | null;
  flyTarget: FlyTarget | null;
  verdictActive: boolean;
  /** A sheet or panel is open where the results rail sits; hide it without losing its filters. */
  railHidden: boolean;
  onVerdict: (v: Verdict) => void;
  onCampground: (p: CampgroundPlace) => void;
  onLiveStatus: (key: LayerKey, status: LoadStatus, count: number) => void;
  onReady?: (map: MLMap) => void;
}

export function MapView(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const liveRef = useRef<LiveDataManager | null>(null);
  const readyRef = useRef(false);
  // keep latest callbacks/state without re-binding map listeners
  const cb = useRef(props);
  cb.current = props;

  // --- results rail: what is in view, and which feature is hovered ---
  const [railItems, setRailItems] = useState<RailItem[]>([]);
  const [railLoading, setRailLoading] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const railFeatures = useRef(new Map<string, Feature>());
  const railBusy = useRef(new Set<LayerKey>());
  // Who set the hover. A pointer that crosses from the canvas onto the rail fires
  // the rail's pointerover before the canvas mouseout, so the mouseout must not
  // wipe a hover the rail just set.
  const hoverOwner = useRef<"map" | "rail" | null>(null);

  // --- create map once ---
  useEffect(() => {
    if (!containerRef.current) return;
    ensurePmtiles();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyle(props.basemap),
      center: [-121.55, 43.9], // Deschutes NF, Oregon Cascades — dispersed-camping country
      zoom: 10.5,
      pitch: props.terrain3D ? 72 : 0,
      maxPitch: 85, // setMaxPitch() validates <= 85; we push past it on the transform below
      attributionControl: { compact: true },
    });
    // MapLibre's public maxPitch caps at 85, but the mercator transform renders
    // cleanly to ~88 (verified). Set the transform's private cap directly to allow a
    // near-horizon look-up. Safe while maplibre-gl is pinned to v4.7.1; the real fix is
    // globe projection in v5 (blocked by its vector-worker bug).
    (map.transform as unknown as { _maxPitch: number })._maxPitch = MAX_PITCH;
    mapRef.current = map;
    (window as unknown as Record<string, unknown>).__map = map; // handy for debugging/tests
    // Zoom only — bearing has the custom compass FAB and pitch has the rocker, so the
    // default control's compass/pitch visualizer would just duplicate them.
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

    const refreshRail = () => {
      if (!liveRef.current) return;
      railFeatures.current = railFeaturesInView(map, liveRef.current, cb.current.overlays);
      setRailItems([...railFeatures.current].map(([id, f]) => railItem(id, f)));
    };

    map.on("load", () => {
      addOverlayLayers(map);
      const live = new LiveDataManager(map, (k, s, c) => {
        cb.current.onLiveStatus(k, s, c);
        if ((k === "mvumRoads" || k === "blmRoads") && (s === "ok" || s === "empty"))
          buildCorridors(map, [...live.features("mvumRoads"), ...live.features("blmRoads")]);
        if ((RAIL_KINDS as string[]).includes(k)) {
          if (s === "loading") railBusy.current.add(k);
          else railBusy.current.delete(k);
          setRailLoading(railBusy.current.size > 0);
          if (s !== "loading") refreshRail();
        }
      });
      liveRef.current = live;
      // apply initial overlay visibility + enablement
      (Object.keys(cb.current.overlays) as OverlayId[]).forEach((o) => {
        setOverlayVisible(map, o, cb.current.overlays[o]);
        if (LIVE_OVERLAYS.has(o)) live.setEnabled(o as LayerKey, cb.current.overlays[o]);
      });
      if (cb.current.terrain3D) map.setTerrain({ source: SRC.terrain, exaggeration: 1.4 });
      readyRef.current = true;
      cb.current.onReady?.(map);
      live.refreshSoon(0);
    });

    map.on("moveend", () => {
      liveRef.current?.refreshSoon();
      refreshRail();
    });
    map.on("click", (e) => handleClick(map, liveRef.current, e.point, e.lngLat, cb.current.onVerdict, cb.current.onCampground));
    map.getCanvas().style.cursor = "crosshair";

    // Hovering a route highlights it and names it. Live refreshes keep the main
    // thread busy, so coalesce moves to one query per frame.
    const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: "hover-tip" });
    const mapHover = (id: string | null) => {
      hoverOwner.current = id ? "map" : null;
      setHoverId(id);
    };
    let queued: MapMouseEvent | null = null;
    let frame = 0;
    map.on("mousemove", (e) => {
      queued = e;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (queued) handleHover(map, queued, tip, mapHover);
      });
    });
    map.on("mouseout", () => {
      queued = null;
      if (hoverOwner.current === "rail") tip.remove();
      else clearHover(map, tip, mapHover);
    });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      tip.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- basemap switching ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    for (const id of BASEMAP_IDS) setBasemapVisible(map, BASEMAP_LAYER_GROUPS[id], id === props.basemap);
  }, [props.basemap]);

  // --- overlay visibility + live enablement ---
  useEffect(() => {
    const map = mapRef.current;
    const live = liveRef.current;
    if (!map || !live || !readyRef.current) return;
    (Object.keys(props.overlays) as OverlayId[]).forEach((o) => {
      setOverlayVisible(map, o, props.overlays[o]);
      if (LIVE_OVERLAYS.has(o)) live.setEnabled(o as LayerKey, props.overlays[o]);
    });
  }, [props.overlays]);

  // --- 3D terrain + camera tilt (Google-Earth feel) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (props.terrain3D) {
      map.setTerrain({ source: SRC.terrain, exaggeration: 1.4 });
      if (map.getPitch() < 25) map.easeTo({ pitch: 72, duration: 700 });
    } else {
      map.setTerrain(null);
      if (map.getPitch() > 5) map.easeTo({ pitch: 0, duration: 700 });
    }
  }, [props.terrain3D]);

  // --- imagery sharpening (nearest-neighbor resampling = crisper when overzoomed
  //     past native ~z19, where no sharper free imagery exists) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const mode = props.sharpenImagery ? "nearest" : "linear";
    for (const id of IMAGERY_LAYERS) {
      if (map.getLayer(id)) map.setPaintProperty(id, "raster-resampling", mode);
    }
  }, [props.sharpenImagery, props.basemap]);

  // --- road/trail line opacity ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const o = props.roadOpacity;
    const set = (id: string, v: number) => {
      if (map.getLayer(id)) map.setPaintProperty(id, "line-opacity", v);
    };
    set(LYR.mvumRoads, o);
    set(LYR.mvumRoadsCasing, o * 0.95);
    set(LYR.blmRoads, o);
    set(LYR.blmRoadsCasing, o * 0.95);
    set(LYR.mvumTrails, o);
    set(LYR.mvumTrailsCasing, o * 0.85);
    set(LYR.trails, o);
    set(LYR.trailsCasing, o * 0.75);
  }, [props.roadOpacity]);

  // --- GPS fix → dot + accuracy ring; follow ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource(SRC.gps) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const fix = props.gpsFix;
    if (!fix) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const ring = circle([fix.lng, fix.lat], Math.max(fix.accuracy, 5) / 1000, { steps: 48, units: "kilometers" });
    const dot: Feature = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [fix.lng, fix.lat] } };
    src.setData({ type: "FeatureCollection", features: [ring as Feature, dot] });
    if (props.follow) map.easeTo({ center: [fix.lng, fix.lat], duration: 600 });
  }, [props.gpsFix, props.follow]);

  // --- explicit recenter ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !props.gpsFix || props.recenterToken === 0) return;
    map.flyTo({ center: [props.gpsFix.lng, props.gpsFix.lat], zoom: Math.max(map.getZoom(), 13), duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.recenterToken]);

  // --- tracks + waypoints ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(SRC.track) as maplibregl.GeoJSONSource | undefined)?.setData(props.trackFC);
  }, [props.trackFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(SRC.waypoints) as maplibregl.GeoJSONSource | undefined)?.setData(props.waypointsFC);
  }, [props.waypointsFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(SRC.route) as maplibregl.GeoJSONSource | undefined)?.setData(props.routeFC);
  }, [props.routeFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(SRC.stops) as maplibregl.GeoJSONSource | undefined)?.setData(props.stopsFC);
  }, [props.stopsFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const p = props.searchPin;
    (map.getSource(SRC.searchPin) as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: p
        ? [{ type: "Feature", properties: { label: p.label }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } }]
        : [],
    });
  }, [props.searchPin]);

  // --- clear road highlight when the verdict card closes ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || props.verdictActive) return;
    (map.getSource(SRC.mvumSelected) as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
  }, [props.verdictActive]);

  // --- fly to region ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !props.flyTarget) return;
    const t = props.flyTarget;
    if (t.bounds)
      map.fitBounds(t.bounds, {
        padding: { top: 90, bottom: 80, left: 50, right: 50 },
        duration: 1100,
        ...(t.pitch != null ? { pitch: t.pitch } : {}),
        ...(t.bearing != null ? { bearing: t.bearing } : {}),
      });
    else if (t.center)
      map.flyTo({
        center: t.center,
        zoom: t.zoom ?? 9,
        duration: 1200,
        ...(t.pitch != null ? { pitch: t.pitch } : {}),
        ...(t.bearing != null ? { bearing: t.bearing } : {}),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.flyTarget?.token]);

  // --- rail -> map: a hovered row lights the same hover source the map uses ---
  const onRailHover = useCallback((id: string | null) => {
    const map = mapRef.current;
    const f = id ? railFeatures.current.get(id) : undefined;
    if (!map) return;
    hoverOwner.current = f ? "rail" : null;
    setHoverFeatures(map, f ? [f] : []);
    setHoverId(f ? id : null);
  }, []);

  // --- rail row click = tapping that feature: campground card, or fly there and open the verdict ---
  const onRailSelect = useCallback((id: string) => {
    const map = mapRef.current;
    const f = railFeatures.current.get(id);
    if (!map || !f) return;
    if (id.startsWith("campgrounds:")) {
      const place = campgroundFromFeature(f);
      if (!place) return;
      (map.getSource(SRC.mvumSelected) as maplibregl.GeoJSONSource | undefined)?.setData(NO_FEATURES as never);
      cb.current.onCampground(place);
      return;
    }
    const at = pointOn(f);
    if (!at) return;
    // Centered, so the point is on screen and hit-testable once the camera settles.
    map.easeTo({ center: at, zoom: Math.max(map.getZoom(), 12), duration: 700 });
    const run = () => {
      const lngLat = { lng: at[0], lat: at[1] };
      handleClick(map, liveRef.current, map.project(lngLat), lngLat, cb.current.onVerdict, null);
    };
    if (map.isMoving()) map.once("moveend", run);
    else run();
  }, []);

  return (
    <>
      <div ref={containerRef} className="map-canvas" />
      <ResultsRail
        items={railItems}
        hoveredId={hoverId}
        onHover={onRailHover}
        onSelect={onRailSelect}
        loading={railLoading}
        className={props.railHidden ? "rail-covered" : undefined}
      />
    </>
  );
}

// --- results rail: flatten the live features in view into rows --------------

type BBox = [number, number, number, number];
const bboxCache = new WeakMap<Feature, BBox>();
const milesCache = new WeakMap<Feature, number>();

function featureBbox(f: Feature): BBox {
  let b = bboxCache.get(f);
  if (!b) bboxCache.set(f, (b = turfBbox(f) as BBox));
  return b;
}

function featureMiles(f: Feature): number | undefined {
  if (f.geometry.type === "Point") return undefined;
  let m = milesCache.get(f);
  if (m === undefined) milesCache.set(f, (m = turfLength(f, { units: "miles" })));
  return m;
}

/** Rail features currently on screen, keyed by the uid liveData stamps, grouped by kind then name. */
function railFeaturesInView(map: MLMap, live: LiveDataManager, overlays: Record<OverlayId, boolean>): Map<string, Feature> {
  const b = map.getBounds();
  const [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  const out = new Map<string, Feature>();
  for (const kind of RAIL_KINDS) {
    if (!overlays[kind]) continue;
    const rows = live.features(kind).filter((f) => {
      if (typeof f.properties?.uid !== "string") return false;
      const [fw, fs, fe, fn] = featureBbox(f);
      return fw <= e && fe >= w && fs <= n && fn >= s;
    });
    rows.sort((a, z) => String(a.properties?.name ?? "").localeCompare(String(z.properties?.name ?? "")));
    for (const f of rows) out.set(f.properties!.uid as string, f);
  }
  return out;
}

const RAIL_NOUN: Record<RailKind, string> = {
  mvumRoads: "Forest road",
  blmRoads: "BLM road",
  mvumTrails: "OHV trail",
  trails: "Trail",
  campgrounds: "Campground",
  poi: "Place",
};
const POI_LABEL: Record<string, string> = { peak: "Peak", lake: "Lake", trailhead: "Trailhead" };

function railItem(id: string, f: Feature): RailItem {
  const kind = id.slice(0, id.indexOf(":")) as RailKind;
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const s = (k: string) => stringProp(p, k);
  const routeNo = kind === "mvumRoads" || kind === "mvumTrails" ? s("id") : kind === "trails" ? s("trailNo") : null;
  const named = s("name");
  let tag: string | null = null;
  const extra: (string | null)[] = [];
  if (kind === "mvumRoads") {
    // mvumRoadColor in layers.ts: "open" is bright blue, anything else deep blue.
    tag = s("passengervehicle")?.toLowerCase() === "open" ? "open" : "restricted";
    extra.push(tag === "open" ? "All vehicles" : s("highclearancevehicle")?.toLowerCase() === "open" ? "High clearance" : "Restricted");
  } else if (kind === "blmRoads") extra.push(s("OBSRVE_SRFCE_TYPE"));
  else if (kind === "campgrounds") {
    tag = s("agency");
    extra.push(tag, s("campType"));
  } else if (kind === "poi") {
    tag = s("poiKind");
    extra.push(POI_LABEL[tag ?? ""] ?? null);
  }
  const season = kind === "mvumRoads" || kind === "mvumTrails" || kind === "blmRoads" ? s("season") : null;
  if (season === "closed") extra.unshift("Closed for season");
  else if (season === "unknown") extra.unshift(kind === "blmRoads" ? "May be closed for season" : "Season dates unreadable");
  const name = named ?? (routeNo ? `${RAIL_NOUN[kind]} ${routeNo}` : `${RAIL_NOUN[kind]} (unnamed)`);
  const sub = [named ? routeNo : null, ...extra].filter((v): v is string => !!v && v !== name);
  const swatchColor =
    season === "closed" ? SEASON_CLOSED_COLOR : season === "unknown" ? SEASON_UNKNOWN_COLOR : railSwatchColor(kind, tag);
  return { id, kind, name, subLabel: sub.join(" · ") || undefined, miles: featureMiles(f), swatchColor };
}

/** A point on the feature for the verdict: the point itself, or a line's middle vertex. */
function pointOn(f: Feature): [number, number] | null {
  const g = f.geometry;
  if (g.type === "Point") return [g.coordinates[0], g.coordinates[1]];
  const line = g.type === "LineString" ? g.coordinates : g.type === "MultiLineString" ? g.coordinates[0] : null;
  // middle vertex, not the true midpoint. It is on the line, which is all the verdict needs.
  const c = line?.[Math.floor(line.length / 2)];
  return c ? [c[0], c[1]] : null;
}

// --- click → legality verdict -------------------------------------------------

/** Wide invisible hit layers first, then the thin hiking-trail line, then the rail's point kinds. */
const HOVER_LAYERS = [LYR.mvumRoadsHit, LYR.mvumTrailsHit, LYR.blmRoadsHit, LYR.trails, LYR.campgroundsHit, LYR.poi];
const NO_FEATURES: FeatureCollection = { type: "FeatureCollection", features: [] };

function setHoverFeatures(map: MLMap, features: Feature[]) {
  (map.getSource(SRC.mvumHover) as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features } as never);
}

function clearHover(map: MLMap, tip: maplibregl.Popup, onHoverId: (id: string | null) => void) {
  setHoverFeatures(map, []);
  map.getCanvas().style.cursor = "crosshair";
  tip.remove();
  onHoverId(null);
}

function handleHover(map: MLMap, e: MapMouseEvent, tip: maplibregl.Popup, onHoverId: (id: string | null) => void) {
  const layers = HOVER_LAYERS.filter((l) => map.getLayer(l));
  if (!layers.length) return clearHover(map, tip, onHoverId);
  const box: [maplibregl.PointLike, maplibregl.PointLike] = [
    [e.point.x - 8, e.point.y - 8],
    [e.point.x + 8, e.point.y + 8],
  ];
  const hit = map.queryRenderedFeatures(box, { layers })[0];
  if (!hit) return clearHover(map, tip, onHoverId);

  setHoverFeatures(map, [hit]);
  onHoverId(typeof hit.properties?.uid === "string" ? hit.properties.uid : null);
  map.getCanvas().style.cursor = "pointer";

  const label = hoverLabel(hit.properties);
  if (label) tip.setLngLat(e.lngLat).setText(label).addTo(map);
  else tip.remove();
}

/** Route number and name both matter on an MVUM; show whichever exist. */
function hoverLabel(props: Record<string, unknown> | null | undefined): string | null {
  if (!props) return null;
  const id = stringProp(props, "id") ?? stringProp(props, "trailNo");
  const name = pickName(props);
  const label = id && name && id !== name ? `${name} (${id})` : (name ?? id);
  if (!label) return null;
  if (props.season === "closed") return `${label}, closed for the season`;
  if (props.season === "unknown")
    return props.agency === "BLM" ? `${label}, may be closed for the season` : `${label}, season dates unreadable`;
  return label;
}

/** A tap at `pt` (screen) / `lngLat`. A null `onCampground` skips the campground check, for rail picks. */
function handleClick(
  map: MLMap,
  live: LiveDataManager | null,
  pt: { x: number; y: number },
  lngLat: { lng: number; lat: number },
  onVerdict: (v: Verdict) => void,
  onCampground: ((p: CampgroundPlace) => void) | null,
) {
  const zoom = map.getZoom();
  const at: [number, number] = [pt.x, pt.y];

  const campLayers = [LYR.campgroundsHit, LYR.campgrounds].filter((l) => map.getLayer(l));
  const campFeats = onCampground && campLayers.length ? map.queryRenderedFeatures(at, { layers: campLayers }) : [];
  const campground = campgroundFromFeature(campFeats[0]);
  if (campground && onCampground) {
    (map.getSource(SRC.mvumSelected) as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
    onCampground(campground);
    return;
  }

  // ownership at the exact point
  const ownFeats = map.getLayer(LYR.ownershipFill)
    ? map.queryRenderedFeatures(at, { layers: [LYR.ownershipFill] })
    : [];
  const ownershipLoaded = zoom >= 8 && (live?.features("ownership").length ?? 0) > 0;
  const manager = (ownFeats[0]?.properties?.manager as Manager | undefined) ?? null;
  const unitName = (ownFeats[0]?.properties?.unit as string | undefined) ?? null;

  // nearest MVUM route within a box around the tap — query the wide hit layers
  // so even thin roads are easy to select
  const box: [maplibregl.PointLike, maplibregl.PointLike] = [
    [pt.x - 40, pt.y - 40],
    [pt.x + 40, pt.y + 40],
  ];
  const routeLayers = [LYR.mvumRoadsHit, LYR.mvumTrailsHit, LYR.blmRoadsHit].filter((l) => map.getLayer(l));
  const routeFeats = routeLayers.length ? map.queryRenderedFeatures(box, { layers: routeLayers }) : [];
  const picked = nearestRoute([lngLat.lng, lngLat.lat], routeFeats);

  // highlight the selected road/trail
  const selSource = map.getSource(SRC.mvumSelected) as maplibregl.GeoJSONSource | undefined;
  selSource?.setData(
    picked ? { type: "FeatureCollection", features: [picked.feature as never] } : { type: "FeatureCollection", features: [] },
  );
  const nearest = picked?.route ?? null;

  // wilderness overrides everything (no motorized, no dispersed) — and SMA would
  // otherwise label wilderness-inside-a-forest as plain USFS
  const wildFeats = map.getLayer(LYR.wildernessFill)
    ? map.queryRenderedFeatures(at, { layers: [LYR.wildernessFill] })
    : [];
  const inWilderness = wildFeats.length > 0;
  const wildernessName = inWilderness ? pickName(wildFeats[0].properties) : null;

  onVerdict(
    computeVerdict({
      lngLat: { lng: lngLat.lng, lat: lngLat.lat },
      manager,
      unitName,
      ownershipLoaded,
      nearestRoute: nearest,
      inWilderness,
      wildernessName,
    }),
  );
}

function campgroundFromFeature(f: Feature | undefined): CampgroundPlace | null {
  if (!f || f.geometry.type !== "Point") return null;
  const coords = f.geometry.coordinates;
  const p = f.properties ?? {};
  const name = stringProp(p, "name") ?? "Campground";
  return {
    id: stringProp(p, "GlobalID") ?? stringProp(p, "OBJECTID") ?? stringProp(p, "FID") ?? `${name}:${coords[0]},${coords[1]}`,
    name,
    lngLat: { lng: coords[0], lat: coords[1] },
    agency: stringProp(p, "agency") ?? "Unknown agency",
    sourceLabel: stringProp(p, "sourceLabel") ?? "Live campground source",
    placeKind: stringProp(p, "placeKind") === "campsite" ? "campsite" : "campground",
    campType: stringProp(p, "campType"),
    area: stringProp(p, "area"),
    detail: stringProp(p, "detail"),
    url: stringProp(p, "url"),
    reservationUrl: stringProp(p, "reservationUrl"),
  };
}

function stringProp(props: Record<string, unknown>, key: string): string | null {
  const v = props[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Pick a human name from an ArcGIS feature's (unknown-cased) properties. */
function pickName(props: Record<string, unknown> | null | undefined): string | null {
  if (!props) return null;
  for (const k of Object.keys(props)) {
    if (k.toLowerCase().includes("name") && typeof props[k] === "string" && props[k]) return props[k] as string;
  }
  return null;
}

const CORRIDOR_BUFFER_M = 91; // ~300 ft motorized dispersed-camping corridor

/** Buffer open motorized MVUM roads into "likely-legal dispersed camping" ribbons. */
function buildCorridors(map: MLMap, feats: Feature[]) {
  const src = map.getSource(SRC.corridors) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const open = feats.filter((f) => {
    const p = f.properties ?? {};
    // A route makes a corridor only while it is open today. Closed or unreadable
    // MVUM dates do not, nor does a BLM seasonal flag (season "unknown"); a BLM
    // route with no flag has no season and is unaffected.
    if (p.season != null && p.season !== "open") return false;
    return (
      String(p.passengervehicle ?? "").toLowerCase() === "open" ||
      String(p.highclearancevehicle ?? "").toLowerCase() === "open"
    );
  });
  if (!open.length) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }
  const subset = open.length > 1200 ? open.slice(0, 1200) : open;
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: subset.map((f) => ({ type: "Feature", properties: {}, geometry: f.geometry })),
  };
  try {
    const buffered = buffer(fc, CORRIDOR_BUFFER_M, { units: "meters" });
    src.setData((buffered as FeatureCollection) ?? { type: "FeatureCollection", features: [] });
  } catch {
    src.setData({ type: "FeatureCollection", features: [] });
  }
}

interface PickedRoute {
  route: NearestRoute;
  feature: maplibregl.MapGeoJSONFeature;
}

function nearestRoute(pt: [number, number], feats: maplibregl.MapGeoJSONFeature[]): PickedRoute | null {
  let best: PickedRoute | null = null;
  for (const f of feats) {
    const g = f.geometry as LineString | MultiLineString;
    const lines: number[][][] = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    for (const coords of lines) {
      if (coords.length < 2) continue;
      const line: Feature<LineString> = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
      const d = pointToLineDistance(pt, line, { units: "meters" });
      if (best === null || d < best.route.distMeters) {
        const p = f.properties ?? {};
        const isTrail = String(f.layer.id).includes("trail");
        // BLM GTLF has no dates, only a seasonal flag: blmSeason() is unknown or null.
        const isMvum = f.layer.id === LYR.mvumRoadsHit || f.layer.id === LYR.mvumTrailsHit;
        const isBlm = f.layer.id === LYR.blmRoadsHit;
        best = {
          feature: f,
          route: {
            name: (p.name as string) || "",
            routeId: (p.id as string) || undefined,
            distMeters: d,
            forest: (p.forestname as string) ?? null,
            district: (p.districtname as string) ?? null,
            openToPassenger: String(p.passengervehicle ?? "").toLowerCase() === "open",
            openToHighClearance: String(p.highclearancevehicle ?? "").toLowerCase() === "open",
            passengerSeason: isMvum ? seasonOn(p.passengervehicle_datesopen, new Date()) : isBlm ? (blmSeason(p) ?? undefined) : undefined,
            highClearanceSeason: isMvum ? seasonOn(p.highclearancevehicle_datesopen, new Date()) : undefined,
            isTrail,
            isBlm,
            seasonNote: isBlm ? stringProp(p, "OHV_DSGNTN_LIM_EXPLAIN") : null,
          },
        };
      }
    }
  }
  return best;
}
