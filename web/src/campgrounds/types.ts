export interface CampgroundPlace {
  id: string;
  name: string;
  lngLat: { lng: number; lat: number };
  agency: string;
  sourceLabel: string;
  placeKind: "campground" | "campsite";
  campType?: string | null;
  area?: string | null;
  detail?: string | null;
  url?: string | null;
  reservationUrl?: string | null;
}
