import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, Feature } from "geojson";
import { ARCGIS_SOURCES, buildQueryUrl, type ArcGISLayerSource } from "./dataSources";
import { normalizeManager, MANAGERS, type Manager } from "./managers";
import { bestSeason, blmSeason, seasonOn } from "../legality/season";

export type LayerKey = "ownership" | "wilderness" | "mvumRoads" | "mvumTrails" | "blmRoads" | "campgrounds" | "trails" | "poi";
export type LoadStatus = "idle" | "loading" | "ok" | "error" | "zoomin" | "empty";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const RECORD_CAP = 2000;
const MAX_PAGES = 8;

interface KeyState {
  fetchedBbox: [number, number, number, number] | null;
  fetchedZoom: number;
  controller: AbortController | null;
}

export class LiveDataManager {
  private map: MLMap;
  private enabled: Record<LayerKey, boolean> = {
    ownership: true,
    wilderness: true,
    mvumRoads: true,
    mvumTrails: false,
    blmRoads: true,
    campgrounds: true,
    trails: false,
    poi: false,
  };
  private state: Record<LayerKey, KeyState> = {
    ownership: { fetchedBbox: null, fetchedZoom: -1, controller: null },
    wilderness: { fetchedBbox: null, fetchedZoom: -1, controller: null },
    mvumRoads: { fetchedBbox: null, fetchedZoom: -1, controller: null },
    mvumTrails: { fetchedBbox: null, fetchedZoom: -1, controller: null },
    blmRoads: { fetchedBbox: null, fetchedZoom: -1, controller: null },
    campgrounds: { fetchedBbox: null, fetchedZoom: -1, controller: null },
    trails: { fetchedBbox: null, fetchedZoom: -1, controller: null },
    poi: { fetchedBbox: null, fetchedZoom: -1, controller: null },
  };
  private cache: Record<LayerKey, FeatureCollection> = {
    ownership: EMPTY,
    wilderness: EMPTY,
    mvumRoads: EMPTY,
    mvumTrails: EMPTY,
    blmRoads: EMPTY,
    campgrounds: EMPTY,
    trails: EMPTY,
    poi: EMPTY,
  };
  private onStatus: (key: LayerKey, status: LoadStatus, count: number) => void;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(map: MLMap, onStatus: (key: LayerKey, status: LoadStatus, count: number) => void) {
    this.map = map;
    this.onStatus = onStatus;
  }

  setEnabled(key: LayerKey, value: boolean) {
    this.enabled[key] = value;
    if (value) this.refreshSoon();
    else this.onStatus(key, "idle", 0);
  }

  features(key: LayerKey): Feature[] {
    return this.cache[key].features;
  }

  refreshSoon(delay = 250) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), delay);
  }

  refresh() {
    const cfgByKey = groupSources();
    const zoom = this.map.getZoom();
    const view = this.footprint(zoom);

    (Object.keys(cfgByKey) as LayerKey[]).forEach((key) => {
      if (!this.enabled[key]) return;
      const eligible = cfgByKey[key].filter((cfg) => zoom >= cfg.minZoom);
      if (!eligible.length) {
        this.onStatus(key, "zoomin", 0);
        return;
      }

      const st = this.state[key];
      if (st.fetchedBbox && Math.floor(zoom) === st.fetchedZoom && contains(st.fetchedBbox, view)) return;
      void this.fetchLayer(key, eligible, view, Math.floor(zoom));
    });
  }

  private footprint(zoom: number): [number, number, number, number] {
    const c = this.map.getCenter();
    const canvas = this.map.getCanvas();
    const degPerPx = 360 / (256 * Math.pow(2, zoom));
    const halfW = (canvas.clientWidth / 2) * degPerPx;
    const halfH = ((canvas.clientHeight / 2) * degPerPx) / Math.cos((c.lat * Math.PI) / 180);
    return [c.lng - halfW, c.lat - halfH, c.lng + halfW, c.lat + halfH];
  }

  private async fetchLayer(key: LayerKey, cfgs: ArcGISLayerSource[], view: [number, number, number, number], zoom: number) {
    const st = this.state[key];
    st.controller?.abort();
    const controller = new AbortController();
    st.controller = controller;

    const padded = pad(view, 0.35);
    this.onStatus(key, "loading", this.cache[key].features.length);

    try {
      const settled = await Promise.allSettled(cfgs.map((cfg) => this.fetchSource(key, cfg, padded, zoom, controller.signal)));
      if (controller.signal.aborted) return;

      const collections = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (!collections.length && settled.some((r) => r.status === "rejected")) throw new Error("all sources failed");

      const fc: FeatureCollection = {
        type: "FeatureCollection",
        features: dedupeFeatures(collections.flatMap((c) => c.features)),
      };
      // One id per feature, carried into rendered features so a map hover and a
      // results-rail row can name the same thing.
      // index-based, so it is only stable for the life of one fetch.
      fc.features.forEach((f, i) => (f.properties!.uid = `${key}:${i}`));

      this.cache[key] = fc;
      st.fetchedBbox = padded;
      st.fetchedZoom = zoom;

      const source = this.map.getSource(cfgs[0].targetSource) as GeoJSONSource | undefined;
      source?.setData(fc as never);
      this.onStatus(key, fc.features.length ? "ok" : "empty", fc.features.length);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      this.onStatus(key, "error", this.cache[key].features.length);
    }
  }

  private async fetchSource(
    key: LayerKey,
    cfg: ArcGISLayerSource,
    padded: [number, number, number, number],
    zoom: number,
    signal: AbortSignal,
  ): Promise<FeatureCollection> {
    const pageSize = cfg.maxRecords ?? RECORD_CAP;
    const geometryOffset = cfg.geometry === "point" ? undefined : (360 / (256 * Math.pow(2, zoom))) * 2;
    const features: Feature[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = buildQueryUrl(cfg, padded, pageSize, page * pageSize, geometryOffset);
      let fc: FeatureCollection | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(url, { signal });
        if (res.ok) {
          fc = (await res.json()) as FeatureCollection;
          break;
        }
        if (attempt === 1) throw new Error(`${cfg.id} HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 500));
        if (signal.aborted) return EMPTY;
      }

      if (!fc || signal.aborted) return EMPTY;
      const batch = fc.features ?? [];
      for (const f of batch) normalizeFeature(key, cfg, f);
      features.push(...batch);
      if (batch.length < pageSize) break;
    }

    return { type: "FeatureCollection", features };
  }
}

const OWNERSHIP_AGENCY_FIELD = "ADMIN_AGENCY_CODE";
const OWNERSHIP_UNIT_FIELD = "ADMIN_UNIT_NAME";

function pad([w, s, e, n]: [number, number, number, number], frac: number): [number, number, number, number] {
  const dx = (e - w) * frac;
  const dy = (n - s) * frac;
  return [w - dx, s - dy, e + dx, n + dy];
}

function contains(outer: [number, number, number, number], inner: [number, number, number, number]): boolean {
  return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}

function groupSources(): Record<LayerKey, ArcGISLayerSource[]> {
  const grouped = {
    ownership: [],
    wilderness: [],
    mvumRoads: [],
    mvumTrails: [],
    blmRoads: [],
    campgrounds: [],
    trails: [],
    poi: [],
  } as Record<LayerKey, ArcGISLayerSource[]>;
  for (const cfg of ARCGIS_SOURCES) grouped[cfg.key].push(cfg);
  return grouped;
}

function normalizeFeature(key: LayerKey, cfg: ArcGISLayerSource, f: Feature) {
  const p = (f.properties ??= {});

  if (key === "ownership") {
    const mgr = normalizeManager(p[OWNERSHIP_AGENCY_FIELD]) as Manager;
    p.manager = mgr;
    p.unit = p[OWNERSHIP_UNIT_FIELD] ?? null;
    p.mgrLabel = MANAGERS[mgr].label;
    return;
  }

  if (key === "mvumRoads" || key === "mvumTrails") {
    // Today's season across the classes the verdict reads, for styling and the
    // corridors. null when no class is designated open (not a seasonal question).
    const now = new Date();
    const open = (v: unknown) => String(v ?? "").toLowerCase() === "open";
    p.season = bestSeason([
      open(p.passengervehicle) ? seasonOn(p.passengervehicle_datesopen, now) : null,
      open(p.highclearancevehicle) ? seasonOn(p.highclearancevehicle_datesopen, now) : null,
    ]);
    return;
  }

  if (key === "blmRoads") {
    p.name = p.ROUTE_PRMRY_NM ?? "";
    p.passengervehicle = "open";
    p.agency = "BLM";
    // A route the BLM flags as seasonally restricted may be closed today: "unknown",
    // styled and kept out of the corridors like an MVUM route with unreadable dates.
    p.season = blmSeason(p);
    return;
  }

  if (key === "trails") {
    p.name = p.trail_name ?? "";
    p.trailNo = p.trail_no ?? null;
    return;
  }

  if (key === "poi" && cfg.poi) {
    p.name = pickFirst(p, cfg.poi.nameFields) ?? "";
    p.poiKind = cfg.poi.kind;
    p.sourceLabel = cfg.poi.sourceLabel;
    p.sourceId = cfg.id;
    return;
  }

  if (key === "campgrounds" && cfg.campground) {
    const c = cfg.campground;
    const area = pickFirst(p, c.areaFields ?? []);
    const rawName = pickFirst(p, c.nameFields);
    const type = pickFirst(p, c.typeFields ?? []);
    const detail = pickFirst(p, c.detailFields ?? []);
    const url = pickFirst(p, c.urlFields ?? []);
    const name =
      cfg.id === "wa-state-campsites" && area && rawName
        ? `${area} site ${rawName}`
        : rawName || area || (c.placeKind === "campsite" ? "Campsite" : "Campground");

    p.name = name;
    p.area = area ?? null;
    p.campType = type ?? null;
    p.detail = detail ?? null;
    p.url = normalizeUrl(url);
    p.agency = c.agency;
    p.sourceLabel = c.sourceLabel;
    p.sourceId = cfg.id;
    p.placeKind = c.placeKind;
    p.reservationUrl = c.reservationUrl ?? null;
  }
}

function pickFirst(props: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const v = props[field];
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s.toLowerCase() !== "null" && s.toLowerCase() !== "not defined") return s;
  }
  return null;
}

function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return null;
}

function dedupeFeatures(features: Feature[]): Feature[] {
  const seen = new Set<string>();
  const out: Feature[] = [];

  for (const f of features) {
    const p = f.properties ?? {};
    const geometry = JSON.stringify(f.geometry);
    const key = `${p.sourceId ?? "src"}:${p.OBJECTID ?? p.objectid ?? p.FID ?? p.GlobalID ?? p.name ?? geometry}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }

  return out;
}
