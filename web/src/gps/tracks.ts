import type { Feature, FeatureCollection, LineString } from "geojson";
import { idbGetAll, idbPut, idbDelete } from "./idb";

export interface TrackPoint {
  lng: number;
  lat: number;
  ele?: number | null;
  ts: number;
}

export interface Track {
  id: string;
  name: string;
  createdAt: number;
  points: TrackPoint[];
}

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const listTracks = () => idbGetAll<Track>("tracks");
export const saveTrack = (t: Track) => idbPut("tracks", t);
export const deleteTrack = (id: string) => idbDelete("tracks", id);

export function trackToFeature(t: Track): Feature<LineString> {
  return {
    type: "Feature",
    properties: { id: t.id, name: t.name },
    geometry: { type: "LineString", coordinates: t.points.map((p) => [p.lng, p.lat]) },
  };
}

export function tracksToFeatureCollection(tracks: Track[]): FeatureCollection {
  return { type: "FeatureCollection", features: tracks.filter((t) => t.points.length > 1).map(trackToFeature) };
}

/** Distance of a track in miles (haversine). */
export function trackMiles(t: Track): number {
  let m = 0;
  for (let i = 1; i < t.points.length; i++) m += haversine(t.points[i - 1], t.points[i]);
  return m / 1609.34;
}

function haversine(a: TrackPoint, b: TrackPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
