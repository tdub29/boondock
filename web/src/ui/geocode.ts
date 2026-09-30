// Shared place lookup: parse a pasted "lat, lon" pair, or search OpenStreetMap
// Nominatim (key-free, US-only). Used by the search bar and the directions stops.

export interface Place {
  lat: number;
  lng: number;
  label: string;
}

// Parse a pasted "lat, lon" pair (Google-Maps order). Accepts comma or space
// separators and optional N/S/E/W suffixes. Returns null if not a coord pair.
export function parseCoords(s: string): { lat: number; lng: number } | null {
  const m = s
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NnSs])?\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EeWw])?$/);
  if (!m) return null;
  let lat = parseFloat(m[1]);
  let lng = parseFloat(m[3]);
  if (m[2]?.toUpperCase() === "S") lat = -lat;
  if (m[4]?.toUpperCase() === "W") lng = -lng;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=us`;
  const res = await fetch(url);
  const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return data.map((r) => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: r.display_name }));
}
