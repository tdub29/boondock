import { idbGetAll, idbPut, idbDelete } from "./idb";

// A saved camera pose — jump back to a spot at the exact zoom/tilt/rotation.
export interface SavedView {
  id: string;
  name: string;
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
  createdAt: number;
}

export const listViews = () => idbGetAll<SavedView>("views");
export const saveView = (v: SavedView) => idbPut("views", v);
export const deleteView = (id: string) => idbDelete("views", id);
