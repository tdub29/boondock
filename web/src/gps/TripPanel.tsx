import { useRef } from "react";
import { trackMiles, type Track } from "./tracks";
import type { Waypoint } from "./waypoints";
import type { SavedView } from "./views";

interface Props {
  tracks: Track[];
  waypoints: Waypoint[];
  recording: boolean;
  currentCount: number;
  onToggleRecord: () => void;
  onDeleteTrack: (id: string) => void;
  onDeleteWaypoint: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onPrintGuide: () => void;
  onFlyToWaypoint: (w: Waypoint) => void;
  views: SavedView[];
  onSaveView: () => void;
  onRestoreView: (v: SavedView) => void;
  onDeleteView: (id: string) => void;
  onClose: () => void;
}

export function TripPanel(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const empty = p.tracks.length === 0 && p.waypoints.length === 0 && p.views.length === 0;

  return (
    <section className="panel" aria-label="Trips">
      <header className="panel-head">
        <h3>Trips</h3>
        <button className="icon-btn" onClick={p.onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="panel-body">
        <div className="record-row">
          <button className={`btn ${p.recording ? "btn-danger" : "btn-primary"}`} onClick={p.onToggleRecord}>
            {p.recording ? `Stop recording (${p.currentCount} pts)` : "Start recording track"}
          </button>
        </div>

        <div className="record-row">
          <button className="btn btn-ghost" onClick={p.onSaveView}>
            ★ Save current view
          </button>
        </div>

        {p.views.length > 0 && (
          <>
            <h4 className="group-label">Saved views</h4>
            <div className="trip-list">
              {p.views.map((v) => (
                <div className="trip-item" key={v.id}>
                  <div className="trip-main" role="button" tabIndex={0} onClick={() => p.onRestoreView(v)}>
                    <span className="trip-name">★ {v.name}</span>
                    <span className="trip-meta">
                      z{v.zoom.toFixed(1)} · {Math.round(v.pitch)}° tilt · {Math.round(v.bearing)}° {v.lat.toFixed(3)}, {v.lng.toFixed(3)}
                    </span>
                  </div>
                  <button className="icon-btn small" onClick={() => p.onDeleteView(v.id)} aria-label="Delete view">
                    🗑
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="io-row">
          <button className="btn btn-ghost" onClick={p.onExport} disabled={empty}>
            Export GPX
          </button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            Import GPX
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml,text/xml"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) p.onImport(f);
              e.target.value = "";
            }}
          />
        </div>

        <div className="record-row">
          <button className="btn btn-ghost" onClick={p.onPrintGuide} disabled={empty}>
            Print trip guide
          </button>
        </div>

        {empty && <p className="hint">No saved tracks or waypoints yet. Tap the map to save a spot, or record a track.</p>}

        {p.tracks.length > 0 && (
          <>
            <h4 className="group-label">Tracks</h4>
            <div className="trip-list">
              {p.tracks.map((t) => (
                <div className="trip-item" key={t.id}>
                  <div className="trip-main">
                    <span className="trip-name">{t.name}</span>
                    <span className="trip-meta">
                      {trackMiles(t).toFixed(1)} mi · {t.points.length} pts
                    </span>
                  </div>
                  <button className="icon-btn small" onClick={() => p.onDeleteTrack(t.id)} aria-label="Delete track">
                    🗑
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {p.waypoints.length > 0 && (
          <>
            <h4 className="group-label">Saved spots</h4>
            <div className="trip-list">
              {p.waypoints.map((w) => (
                <div className="trip-item" key={w.id}>
                  <div className="trip-main" role="button" tabIndex={0} onClick={() => p.onFlyToWaypoint(w)}>
                    <span className="trip-name">
                      <span className={`wp-dot level-${w.level ?? "unknown"}`} /> {w.name}
                    </span>
                    <span className="trip-meta">
                      {w.lat.toFixed(4)}, {w.lng.toFixed(4)}
                    </span>
                  </div>
                  <button className="icon-btn small" onClick={() => p.onDeleteWaypoint(w.id)} aria-label="Delete waypoint">
                    🗑
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
