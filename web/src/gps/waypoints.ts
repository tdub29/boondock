import type { FeatureCollection } from "geojson";
import { idbGetAll, idbPut, idbDelete } from "./idb";

export type WaypointLevel = "green" | "yellow" | "red" | "unknown";

export interface Waypoint {
  id: string;
  name: string;
  lng: number;
  lat: number;
  note?: string;
  createdAt: number;
  level?: WaypointLevel;
}

export const listWaypoints = () => idbGetAll<Waypoint>("waypoints");
export const saveWaypoint = (w: Waypoint) => idbPut("waypoints", w);
export const deleteWaypoint = (id: string) => idbDelete("waypoints", id);

export function waypointsToFeatureCollection(ws: Waypoint[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: ws.map((w) => ({
      type: "Feature",
      properties: { id: w.id, name: w.name, level: w.level ?? "unknown" },
      geometry: { type: "Point", coordinates: [w.lng, w.lat] },
    })),
  };
}
