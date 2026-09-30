import type { Feature, LineString } from "geojson";

// Drive estimate broken into CHUNKS: precise paved roads, forest backroads
// (re-timed at a realistic cap since OSRM over-speeds them), and the last unmapped
// stretch to an off-road spot. Falls back to a straight-line estimate when offline.

export type SegKind = "paved" | "backroad" | "gap";

export interface Chunk {
  key: SegKind;
  label: string;
  miles: number;
  mins: number;
}

// Per-leg totals: one entry per consecutive stop pair (1→2, 2→3, …).
export interface Leg {
  miles: number;
  mins: number;
}

export interface RouteResult {
  precise: boolean;
  features: Feature<LineString>[];
  bounds: [number, number, number, number];
  chunks: Chunk[];
  legs: Leg[];
  mins: number;
  miles: number;
}

export type LL = { lng: number; lat: number };

const M_PER_MI = 1609.34;
const PAVED_MS = 13.4; // ≥30 mph ⇒ treat as paved/highway
const BACKROAD_CAP_MS = 9.4; // ~21 mph realistic ceiling for forest backroads
const GAP_MPH = 14; // rough unmapped spur
const FALLBACK_MPH = 30;
const DETOUR = 1.35;

function milesBetween(a: [number, number], b: [number, number]): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const line = (coords: number[][], seg: SegKind): Feature<LineString> => ({
  type: "Feature",
  properties: { seg },
  geometry: { type: "LineString", coordinates: coords },
});

/** Group consecutive coords sharing a class into one LineString feature each. */
function buildRuns(coords: number[][], segClass: SegKind[]): Feature<LineString>[] {
  const feats: Feature<LineString>[] = [];
  let start = 0;
  for (let i = 0; i < segClass.length; i++) {
    if (i + 1 < segClass.length && segClass[i + 1] === segClass[i]) continue;
    feats.push(line(coords.slice(start, i + 2), segClass[i]));
    start = i + 1;
  }
  return feats;
}

const round = (n: number) => Math.round(n);

/** Route through 2+ ordered stops (start, optional vias, end). */
export async function getRoute(stops: LL[]): Promise<RouteResult> {
  const pts = stops.map((s) => [s.lng, s.lat] as [number, number]);
  const op = pts[0];
  const dp = pts[pts.length - 1];
  const bounds: [number, number, number, number] = [
    Math.min(...pts.map((p) => p[0])),
    Math.min(...pts.map((p) => p[1])),
    Math.max(...pts.map((p) => p[0])),
    Math.max(...pts.map((p) => p[1])),
  ];

  try {
    const coordStr = stops.map((s) => `${s.lng},${s.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&annotations=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const route = data.routes?.[0];
    const legs = route?.legs as { annotation?: { distance?: number[]; duration?: number[]; speed?: number[] } }[] | undefined;
    const wps = data.waypoints as { location: [number, number] }[] | undefined;
    const snapped = wps?.[wps.length - 1]?.location;
    if (!route || !snapped || !legs?.length) throw new Error("no route");

    const coords = route.geometry.coordinates as number[][];

    // Single pass over legs: build the flat segment classes for geometry coloring,
    // the global road-type chunks, AND a per-leg (stop→stop) miles/seconds accumulator.
    let pavedM = 0,
      pavedSec = 0,
      backM = 0,
      backSec = 0;
    const segClass: SegKind[] = [];
    const legAcc: { m: number; sec: number }[] = [];
    for (const leg of legs) {
      if (!leg.annotation?.distance) throw new Error("no annotation");
      const D = leg.annotation.distance;
      const U = leg.annotation.duration ?? [];
      const S = leg.annotation.speed ?? [];
      let legM = 0,
        legSec = 0;
      for (let i = 0; i < D.length; i++) {
        const dm = D[i];
        const ds = U[i] || 0;
        const speed = S[i] ?? (ds > 0 ? dm / ds : 0);
        if (speed >= PAVED_MS) {
          segClass.push("paved");
          pavedM += dm;
          pavedSec += ds;
          legSec += ds;
        } else {
          const sec = dm / Math.min(speed || BACKROAD_CAP_MS, BACKROAD_CAP_MS);
          segClass.push("backroad");
          backM += dm;
          backSec += sec;
          legSec += sec;
        }
        legM += dm;
      }
      legAcc.push({ m: legM, sec: legSec });
    }

    const features = buildRuns(coords, segClass);

    const gapMi = milesBetween(snapped, dp);
    const gapSec = (gapMi / GAP_MPH) * 3600;
    if (gapMi > 0.04) {
      features.push(line([snapped, dp], "gap"));
      bounds[0] = Math.min(bounds[0], snapped[0]);
      bounds[1] = Math.min(bounds[1], snapped[1]);
      bounds[2] = Math.max(bounds[2], snapped[0]);
      bounds[3] = Math.max(bounds[3], snapped[1]);
      // the unmapped last stretch belongs to the final leg
      const last = legAcc[legAcc.length - 1];
      if (last) {
        last.m += gapMi * M_PER_MI;
        last.sec += gapSec;
      }
    }

    const chunks: Chunk[] = [];
    if (pavedM > 0) chunks.push({ key: "paved", label: "Highway / paved", miles: pavedM / M_PER_MI, mins: round(pavedSec / 60) });
    if (backM > 0) chunks.push({ key: "backroad", label: "Forest backroads", miles: backM / M_PER_MI, mins: round(backSec / 60) });
    if (gapMi > 0.04) chunks.push({ key: "gap", label: "Last stretch (est.)", miles: gapMi, mins: round(gapSec / 60) });

    const routeLegs: Leg[] = legAcc.map((l) => ({ miles: l.m / M_PER_MI, mins: round(l.sec / 60) }));
    const mins = round((pavedSec + backSec + gapSec) / 60);
    const miles = (pavedM + backM) / M_PER_MI + gapMi;
    return { precise: true, features, bounds, chunks, legs: routeLegs, mins, miles };
  } catch {
    // Offline / no route: straight-line estimate per consecutive stop pair.
    const legs: Leg[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const mi = milesBetween(pts[i], pts[i + 1]) * DETOUR;
      legs.push({ miles: mi, mins: round((mi / FALLBACK_MPH) * 60) });
    }
    const straightMi = legs.reduce((s, l) => s + l.miles, 0);
    const mins = round((straightMi / FALLBACK_MPH) * 60);
    return {
      precise: false,
      legs,
      features: [line([op, dp], "gap")],
      bounds,
      chunks: [{ key: "gap", label: "Straight-line est.", miles: straightMi, mins }],
      mins,
      miles: straightMi,
    };
  }
}

export const fmtTime = (mins: number) => (mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`);
export const fmtMi = (mi: number) => (mi < 10 ? mi.toFixed(1) : Math.round(mi).toString());
