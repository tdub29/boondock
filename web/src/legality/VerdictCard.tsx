import { useEffect, useState } from "react";
import type { Verdict, VerdictLevel } from "./verdict";

const LEVEL_META: Record<VerdictLevel, { label: string; emoji: string }> = {
  green: { label: "Likely OK", emoji: "✓" },
  yellow: { label: "Verify", emoji: "!" },
  red: { label: "No camping", emoji: "✕" },
  unknown: { label: "Unknown", emoji: "?" },
};

interface Props {
  verdict: Verdict;
  origin: { lng: number; lat: number } | null;
  onClose: () => void;
  onSaveWaypoint: (v: Verdict) => void;
  onShowRoute: () => void;
  onSetStart: () => void;
}

const AVG_MPH = 32; // blended forest-road + approach speed
const DETOUR = 1.35; // roads aren't straight lines

function milesBetween(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 3958.8; // miles
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

export function VerdictCard({ verdict: v, origin, onClose, onSaveWaypoint, onShowRoute, onSetStart }: Props) {
  const [showRules, setShowRules] = useState(false);
  const [saved, setSaved] = useState(false);
  const [elev, setElev] = useState<number | null>(null);
  const meta = LEVEL_META[v.level];
  const drive = origin ? driveEstimate(origin, v.lngLat) : null;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${v.lngLat.lat},${v.lngLat.lng}&travelmode=driving`;

  useEffect(() => {
    let cancelled = false;
    setElev(null);
    fetch(`https://epqs.nationalmap.gov/v1/json?x=${v.lngLat.lng}&y=${v.lngLat.lat}&units=Feet&wkid=4326`)
      .then((r) => r.json())
      .then((d) => {
        const val = Number(d?.value);
        if (!cancelled && Number.isFinite(val) && val > -1000) setElev(Math.round(val));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [v.lngLat.lat, v.lngLat.lng]);

  return (
    <div data-panel="verdict-card" className={`verdict-card level-${v.level}`} role="dialog" aria-label="Camping legality">
      <div className="verdict-grip" />
      <header className="verdict-head">
        <span className="verdict-pill" aria-hidden>
          <span className="verdict-pill-icon">{meta.emoji}</span>
          {meta.label}
        </span>
        <div className="verdict-titles">
          <h2>{v.title}</h2>
          <p>{v.subtitle}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <p className="verdict-coords">
        {v.lngLat.lat.toFixed(5)}, {v.lngLat.lng.toFixed(5)}
        {elev != null && <span className="verdict-elev"> · {elev.toLocaleString()} ft</span>}
      </p>

      <div className="verdict-drive">
        {drive ? (
          <>
            <span>
              🚗 ~{drive.time} · {drive.miles} mi <span className="drive-note">(quick est.)</span>
            </span>
            <button className="route-link" onClick={onShowRoute}>
              Show route →
            </button>
          </>
        ) : (
          <span className="drive-note">🚗 Turn on Locate for a drive estimate, or tap Directions</span>
        )}
      </div>

      <button className="setstart-btn" onClick={onSetStart}>
        ◎ Use this point as my trip start
      </button>

      {v.nearestRoute && (
        <div className="verdict-route">
          <span className="route-dot" />
          Nearest route: <strong>{v.nearestRoute.name || v.nearestRoute.routeId || (v.nearestRoute.isTrail ? "Trail" : "Road")}</strong>
          {" · "}
          {Math.round(v.nearestRoute.distMeters * 3.28084)} ft
          {v.nearestRoute.forest ? ` · ${v.nearestRoute.forest}` : ""}
        </div>
      )}

      <ul className="verdict-reasons">
        {v.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      {v.stayLimit && (
        <div className="verdict-stay">
          <span className="stay-label">Stay limit</span> {v.stayLimit}
        </div>
      )}

      {v.rules.length > 0 && (
        <div className="verdict-section">
          <button className="section-toggle" onClick={() => setShowRules((s) => !s)} aria-expanded={showRules}>
            {showRules ? "▾" : "▸"} Rules for this land
          </button>
          {showRules && (
            <ul className="verdict-rules">
              {v.rules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="verdict-caveats">
        {v.caveats.map((c, i) => (
          <p key={i}>⚠ {c}</p>
        ))}
      </div>

      {v.sourceNote && <p className="verdict-source">Source: {v.sourceNote}, queried live</p>}

      <div className="verdict-actions">
        <button
          className="btn btn-primary"
          disabled={saved}
          onClick={() => {
            onSaveWaypoint(v);
            setSaved(true);
          }}
        >
          {saved ? "Saved ✓" : "Save spot"}
        </button>
        <a className="btn btn-ghost" href={directionsUrl} target="_blank" rel="noreferrer">
          Directions →
        </a>
      </div>
      <a className="verdict-rules-link" href={v.rangerLink} target="_blank" rel="noreferrer">
        Check current rules &amp; closures →
      </a>
    </div>
  );
}
