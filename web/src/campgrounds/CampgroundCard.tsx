import { useState } from "react";
import type { CampgroundPlace } from "./types";

interface Props {
  place: CampgroundPlace;
  origin: { lng: number; lat: number } | null;
  onClose: () => void;
  onSavePlace: (p: CampgroundPlace) => void;
  onShowRoute: () => void;
  onSetStart: () => void;
}

const AVG_MPH = 32;
const DETOUR = 1.35;

function milesBetween(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function driveEstimate(origin: { lng: number; lat: number }, dest: { lng: number; lat: number }) {
  const roadMi = milesBetween(origin, dest) * DETOUR;
  const mins = Math.round((roadMi / AVG_MPH) * 60);
  const time = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
  return { miles: roadMi < 10 ? roadMi.toFixed(1) : Math.round(roadMi).toString(), time };
}

export function CampgroundCard({ place, origin, onClose, onSavePlace, onShowRoute, onSetStart }: Props) {
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const drive = origin ? driveEstimate(origin, place.lngLat) : null;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lngLat.lat},${place.lngLat.lng}&travelmode=driving`;
  const availabilityUrl =
    place.url ??
    place.reservationUrl ??
    `https://www.recreation.gov/search?q=${encodeURIComponent(place.name)}&entity_type=campground`;

  async function share() {
    const text = `${place.name} - ${place.lngLat.lat.toFixed(5)}, ${place.lngLat.lng.toFixed(5)}\n${directionsUrl}`;
    try {
      if (navigator.share) await navigator.share({ title: place.name, text, url: directionsUrl });
      else await navigator.clipboard.writeText(text);
      setShared(true);
    } catch {
      setShared(false);
    }
  }

  return (
    <div className="verdict-card camp-card" role="dialog" aria-label="Campground details">
      <div className="verdict-grip" />
      <header className="verdict-head camp-head">
        <span className="camp-pill">{place.placeKind === "campsite" ? "Site" : "Campground"}</span>
        <div className="verdict-titles">
          <h2>{place.name}</h2>
          <p>
            {place.agency}
            {place.area ? ` - ${place.area}` : ""}
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          x
        </button>
      </header>

      <p className="verdict-coords">
        {place.lngLat.lat.toFixed(5)}, {place.lngLat.lng.toFixed(5)}
      </p>

      <div className="camp-facts">
        {place.campType && (
          <div className="camp-fact">
            <span>Type</span>
            <strong>{place.campType}</strong>
          </div>
        )}
        <div className="camp-fact">
          <span>Source</span>
          <strong>{place.sourceLabel}</strong>
        </div>
      </div>

      {place.detail && <p className="camp-detail">{place.detail}</p>}

      <div className="verdict-drive">
        {drive ? (
          <>
            <span>
              ~{drive.time} - {drive.miles} mi <span className="drive-note">(quick est.)</span>
            </span>
            <button className="route-link" onClick={onShowRoute}>
              Show route
            </button>
          </>
        ) : (
          <span className="drive-note">Turn on Locate for a drive estimate, or tap Directions.</span>
        )}
      </div>

      <button className="setstart-btn" onClick={onSetStart}>
        Use this place as my trip start
      </button>

      <div className="verdict-caveats">
        <p>Check the managing agency for fees, season dates, fire restrictions, and current closures before relying on the marker.</p>
        <p>Availability alerts require a server-side monitor; this app links you to the reservation source instead of auto-checking openings.</p>
      </div>

      <div className="verdict-actions">
        <button
          className="btn btn-primary"
          disabled={saved}
          onClick={() => {
            onSavePlace(place);
            setSaved(true);
          }}
        >
          {saved ? "Saved" : "Save place"}
        </button>
        <a className="btn btn-ghost" href={directionsUrl} target="_blank" rel="noreferrer">
          Directions
        </a>
      </div>

      <div className="camp-actions-row">
        <a className="btn btn-ghost" href={availabilityUrl} target="_blank" rel="noreferrer">
          Availability
        </a>
        <button className="btn btn-ghost" onClick={share}>
          {shared ? "Copied" : "Share"}
        </button>
      </div>
    </div>
  );
}
