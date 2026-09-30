import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { MapView, type FlyTarget } from "./map/MapView";
import { getRoute, fmtTime, fmtMi, type RouteResult } from "./map/routing";
import { DirectionsPanel, stopBadge, type Stop } from "./ui/DirectionsPanel";
import { CameraControls } from "./ui/CameraControls";
import type { BasemapId, OverlayId } from "./map/ids";
import type { LayerKey, LoadStatus } from "./map/liveData";
import { TopBar } from "./ui/TopBar";
import { SearchBar } from "./ui/SearchBar";
import { Toolbar, type PanelId } from "./ui/Toolbar";
import { LayerPanel } from "./layers/LayerPanel";
import { OfflinePanel } from "./offline/OfflinePanel";
import { TripPanel } from "./gps/TripPanel";
import { VerdictCard } from "./legality/VerdictCard";
import type { Verdict } from "./legality/verdict";
import { CampgroundCard } from "./campgrounds/CampgroundCard";
import type { CampgroundPlace } from "./campgrounds/types";
import { useGeolocation } from "./gps/useGeolocation";
import {
  listTracks,
  saveTrack,
  deleteTrack,
  tracksToFeatureCollection,
  trackToFeature,
  trackMiles,
  newId,
  type Track,
  type TrackPoint,
} from "./gps/tracks";
import { listWaypoints, saveWaypoint, deleteWaypoint, waypointsToFeatureCollection, type Waypoint } from "./gps/waypoints";
import { listViews, saveView, deleteView, type SavedView } from "./gps/views";
import { buildGpx, parseGpx, downloadText } from "./gps/gpx";
import type { Region } from "./offline/regions";

const DEFAULT_OVERLAYS: Record<OverlayId, boolean> = {
  roads: true,
  corridors: true,
  campgrounds: true,
  ownership: true,
  wilderness: true,
  mvumRoads: true,
  mvumTrails: false,
  blmRoads: true,
  trails: false,
  poi: false,
  hillshade: false,
};

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tripGuideHtml(tracks: Track[], waypoints: Waypoint[], views: SavedView[]): string {
  const today = new Date().toLocaleDateString();
  const waypointRows = waypoints
    .map(
      (w) =>
        `<tr><td>${escHtml(w.name)}</td><td>${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}</td><td>${escHtml(w.note ?? "")}</td></tr>`,
    )
    .join("");
  const trackRows = tracks
    .map((t) => `<tr><td>${escHtml(t.name)}</td><td>${trackMiles(t).toFixed(1)} mi</td><td>${t.points.length} points</td></tr>`)
    .join("");
  const viewRows = views
    .map((v) => `<tr><td>${escHtml(v.name)}</td><td>${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}</td><td>z${v.zoom.toFixed(1)}</td></tr>`)
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Boondock Trip Guide</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 36px; color: #16201a; }
    h1 { margin: 0 0 4px; }
    h2 { margin-top: 28px; border-bottom: 1px solid #d8ddd3; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { text-align: left; vertical-align: top; padding: 8px; border-bottom: 1px solid #e4e7df; font-size: 13px; }
    th { background: #f4f1e8; }
    .muted { color: #667064; }
  </style>
</head>
<body>
  <h1>Boondock Trip Guide</h1>
  <p class="muted">Generated ${escHtml(today)}. Verify campground fees, fire restrictions, road conditions, and closure orders before leaving.</p>
  <h2>Saved Places</h2>
  <table><thead><tr><th>Name</th><th>Coordinates</th><th>Notes</th></tr></thead><tbody>${waypointRows || "<tr><td colspan=\"3\">No saved places.</td></tr>"}</tbody></table>
  <h2>Tracks</h2>
  <table><thead><tr><th>Name</th><th>Distance</th><th>Detail</th></tr></thead><tbody>${trackRows || "<tr><td colspan=\"3\">No saved tracks.</td></tr>"}</tbody></table>
  <h2>Saved Views</h2>
  <table><thead><tr><th>Name</th><th>Center</th><th>Zoom</th></tr></thead><tbody>${viewRows || "<tr><td colspan=\"3\">No saved views.</td></tr>"}</tbody></table>
</body>
</html>`;
}

export default function App() {
  const [basemap, setBasemap] = useState<BasemapId>("satellite");
  const [overlays, setOverlays] = useState<Record<OverlayId, boolean>>(DEFAULT_OVERLAYS);
  const [terrain3D, setTerrain3D] = useState(true);
  const [roadOpacity, setRoadOpacity] = useState(1);
  const [sharpenImagery, setSharpenImagery] = useState(true);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [campground, setCampground] = useState<CampgroundPlace | null>(null);
  const [liveStatus, setLiveStatus] = useState<Partial<Record<LayerKey, { status: LoadStatus; count: number }>>>({});
  const [online, setOnline] = useState(navigator.onLine);
  const [mapInst, setMapInst] = useState<MLMap | null>(null);

  // GPS + follow
  const { fix, status, start } = useGeolocation();
  const [followOn, setFollowOn] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  const autoCentered = useRef(false);

  // Auto-locate on load (no manual tap), and center on the user's first fix.
  useEffect(() => {
    start();
  }, [start]);
  useEffect(() => {
    if (fix && !autoCentered.current) {
      autoCentered.current = true;
      setFollowOn(true);
      setRecenterToken((t) => t + 1);
    }
  }, [fix]);

  // Trips
  const [tracks, setTracks] = useState<Track[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [recording, setRecording] = useState(false);
  const [recPoints, setRecPoints] = useState<TrackPoint[]>([]);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [routeFC, setRouteFC] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);
  const emptyStop = (): Stop => ({ id: newId(), query: "", point: null, label: "" });
  const [stops, setStops] = useState<Stop[]>(() => [emptyStop(), emptyStop()]);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [searchPin, setSearchPin] = useState<{ lng: number; lat: number; label: string } | null>(null);
  const [pinSaved, setPinSaved] = useState(false);
  const routeSeq = useRef(0);

  // Drive estimate baseline for the verdict/campground cards: first resolved stop, else GPS.
  const routeOrigin = stops.find((s) => s.point)?.point ?? (fix ? { lng: fix.lng, lat: fix.lat } : null);

  // Recompute the route through every resolved stop (in order). Ignores stale
  // responses so a fast edit-then-edit doesn't flash an old route.
  const recompute = async (list: Stop[]) => {
    const pts = list.filter((s) => s.point).map((s) => s.point!);
    if (pts.length < 2) {
      setRouteFC({ type: "FeatureCollection", features: [] });
      setRouteInfo(null);
      setRouting(false);
      return;
    }
    const seq = ++routeSeq.current;
    setFollowOn(false);
    setRouting(true);
    const r = await getRoute(pts);
    if (seq !== routeSeq.current) return; // superseded
    setRouteFC({ type: "FeatureCollection", features: r.features });
    setRouteInfo(r);
    setRouting(false);
    setFlyTarget({ bounds: r.bounds, pitch: 0, bearing: 0, token: Date.now() });
  };

  // All stop mutations use functional updates so near-simultaneous resolves compose
  // instead of clobbering each other. A useEffect recomputes the route when the
  // ordered set of resolved coordinates changes (see routeKey below).
  const onStopQuery = (i: number, q: string) => setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, query: q } : s)));
  const onStopResolve = (i: number, lng: number, lat: number, label: string) =>
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, point: { lng, lat }, label, query: label } : s)));
  const onStopClear = (i: number) =>
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, point: null, label: "", query: "" } : s)));
  const onStopRemove = (i: number) => setStops((prev) => prev.filter((_, idx) => idx !== i));
  const onReorderStops = (from: number, to: number) =>
    setStops((prev) => {
      const a = [...prev];
      const [moved] = a.splice(from, 1);
      a.splice(to, 0, moved);
      return a;
    });
  const onAddStop = () => setStops((prev) => [...prev, emptyStop()]);
  const onUseMyLocation = (i: number) => {
    if (!fix) return;
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, point: { lng: fix.lng, lat: fix.lat }, label: "My location", query: "My location" } : s)));
  };
  const clearAll = () => setStops([emptyStop(), emptyStop()]);

  // From a tapped/searched place: fill the destination (last stop), seeding the
  // start with My location when it's empty and GPS is available.
  const routeToPoint = (lng: number, lat: number, label: string) => {
    setStops((prev) => {
      const next = prev.length >= 2 ? [...prev] : [emptyStop(), emptyStop()];
      if (!next[0].point && fix) next[0] = { ...next[0], point: { lng: fix.lng, lat: fix.lat }, label: "My location", query: "My location" };
      const li = next.length - 1;
      next[li] = { ...next[li], point: { lng, lat }, label, query: label };
      return next;
    });
    setVerdict(null);
    setCampground(null);
    setSearchPin(null);
    setDirectionsOpen(true);
  };
  // Set the trip start (first stop) to a specific point.
  const setStartPoint = (lng: number, lat: number, label: string) => {
    setStops((prev) => {
      const next = prev.length >= 1 ? [...prev] : [emptyStop(), emptyStop()];
      next[0] = { ...next[0], point: { lng, lat }, label, query: label };
      return next;
    });
    setVerdict(null);
    setCampground(null);
    setDirectionsOpen(true);
  };

  // Recompute whenever the ordered list of resolved coordinates changes.
  const routeKey = useMemo(
    () => JSON.stringify(stops.filter((s) => s.point).map((s) => [s.point!.lng, s.point!.lat])),
    [stops],
  );
  useEffect(() => {
    void recompute(stops);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const onSearchSelect = (lng: number, lat: number, label: string) => {
    setFollowOn(false); // stop GPS follow from yanking the camera back to current location
    setVerdict(null);
    setCampground(null);
    setPinSaved(false);
    setSearchPin({ lng, lat, label });
    setFlyTarget({ center: [lng, lat], zoom: 12, token: Date.now() });
  };

  const onSavePin = () => {
    if (!searchPin) return;
    const w: Waypoint = {
      id: newId(),
      name: searchPin.label || `Pin ${searchPin.lat.toFixed(3)}, ${searchPin.lng.toFixed(3)}`,
      lng: searchPin.lng,
      lat: searchPin.lat,
      level: "unknown",
      createdAt: Date.now(),
    };
    void saveWaypoint(w).then(() => listWaypoints().then(setWaypoints));
    setPinSaved(true);
  };

  // initial load
  useEffect(() => {
    void listTracks().then(setTracks);
    void listWaypoints().then(setWaypoints);
    void listViews().then(setViews);
  }, []);

  const onSaveView = () => {
    if (!mapInst) return;
    const c = mapInst.getCenter();
    const v: SavedView = {
      id: newId(),
      name: `View ${views.length + 1}`,
      lng: c.lng,
      lat: c.lat,
      zoom: mapInst.getZoom(),
      pitch: mapInst.getPitch(),
      bearing: mapInst.getBearing(),
      createdAt: Date.now(),
    };
    void saveView(v).then(() => listViews().then(setViews));
  };

  const onRestoreView = (v: SavedView) => {
    setFollowOn(false);
    setFlyTarget({ center: [v.lng, v.lat], zoom: v.zoom, pitch: v.pitch, bearing: v.bearing, token: Date.now() });
    setPanel(null);
  };

  // online/offline
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // record GPS fixes into the active track
  useEffect(() => {
    if (recording && fix) setRecPoints((prev) => [...prev, { lng: fix.lng, lat: fix.lat, ts: fix.ts, ele: null }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix]);

  const onLiveStatus = useCallback((key: LayerKey, s: LoadStatus, count: number) => {
    setLiveStatus((prev) => ({ ...prev, [key]: { status: s, count } }));
  }, []);

  const onLocate = () => {
    if (status !== "active" && status !== "locating") {
      start();
      setFollowOn(true);
    } else {
      setFollowOn((v) => !v);
      setRecenterToken((t) => t + 1);
    }
  };

  const onToggleRecord = () => {
    if (!recording) {
      if (status !== "active" && status !== "locating") start();
      setRecPoints([]);
      setRecording(true);
      setFollowOn(true);
    } else {
      setRecording(false);
      if (recPoints.length > 1) {
        const t: Track = { id: newId(), name: `Track ${new Date().toLocaleString()}`, createdAt: Date.now(), points: recPoints };
        void saveTrack(t).then(() => listTracks().then(setTracks));
      }
      setRecPoints([]);
    }
  };

  const onSaveWaypoint = (v: Verdict) => {
    const w: Waypoint = {
      id: newId(),
      name: `Spot ${v.lngLat.lat.toFixed(3)}, ${v.lngLat.lng.toFixed(3)}`,
      lng: v.lngLat.lng,
      lat: v.lngLat.lat,
      level: v.level,
      createdAt: Date.now(),
    };
    void saveWaypoint(w).then(() => listWaypoints().then(setWaypoints));
  };

  const onSaveCampground = (p: CampgroundPlace) => {
    const note = [
      p.placeKind === "campsite" ? "Developed campsite" : "Developed campground",
      p.agency,
      p.area,
      p.campType,
      p.detail,
      p.url,
    ]
      .filter(Boolean)
      .join(" | ");
    const w: Waypoint = {
      id: newId(),
      name: p.name,
      lng: p.lngLat.lng,
      lat: p.lngLat.lat,
      note,
      level: "unknown",
      createdAt: Date.now(),
    };
    void saveWaypoint(w).then(() => listWaypoints().then(setWaypoints));
  };

  const onPrintGuide = () => {
    const html = tripGuideHtml(tracks, waypoints, views);
    const win = window.open("", "_blank");
    if (!win) {
      downloadText(`boondock-guide-${new Date().toISOString().slice(0, 10)}.html`, html, "text/html");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const onExport = () => downloadText(`boondock-${new Date().toISOString().slice(0, 10)}.gpx`, buildGpx(tracks, waypoints));

  const onImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { tracks: it, waypoints: iw } = parseGpx(String(reader.result));
        await Promise.all([...it.map(saveTrack), ...iw.map(saveWaypoint)]);
        await Promise.all([listTracks().then(setTracks), listWaypoints().then(setWaypoints)]);
      } catch (e) {
        alert((e as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const onFlyToRegion = (r: Region) => {
    setFollowOn(false);
    setFlyTarget({ bounds: r.bounds, token: Date.now() });
    setPanel(null);
  };
  const onFlyToWaypoint = (w: Waypoint) => {
    setFollowOn(false);
    setFlyTarget({ center: [w.lng, w.lat], zoom: 14, token: Date.now() });
    setPanel(null);
  };

  const trackFC = useMemo(() => {
    const fc = tracksToFeatureCollection(tracks);
    if (recPoints.length > 1) {
      fc.features.push(trackToFeature({ id: "current", name: "Recording", createdAt: 0, points: recPoints }));
    }
    return fc;
  }, [tracks, recPoints]);

  const waypointsFC = useMemo(() => waypointsToFeatureCollection(waypoints), [waypoints]);

  const stopsFC = useMemo<FeatureCollection>(() => {
    const placed = stops.filter((s) => s.point);
    return {
      type: "FeatureCollection",
      features: placed.map((s, i) => ({
        type: "Feature",
        properties: {
          badge: stopBadge(i, placed.length),
          kind: i === 0 ? "start" : i === placed.length - 1 ? "end" : "via",
        },
        geometry: { type: "Point", coordinates: [s.point!.lng, s.point!.lat] },
      })),
    };
  }, [stops]);

  const busy = Object.values(liveStatus).some((s) => s?.status === "loading");

  return (
    <div className="app" data-verify="app" data-map-ready={mapInst ? "true" : "false"}>
      <MapView
        basemap={basemap}
        overlays={overlays}
        terrain3D={terrain3D}
        roadOpacity={roadOpacity}
        sharpenImagery={sharpenImagery}
        gpsFix={fix}
        follow={followOn}
        recenterToken={recenterToken}
        trackFC={trackFC}
        waypointsFC={waypointsFC}
        routeFC={routeFC}
        stopsFC={stopsFC}
        searchPin={searchPin}
        flyTarget={flyTarget}
        verdictActive={!!verdict}
        railHidden={!!panel || !!verdict || !!campground || directionsOpen}
        onReady={setMapInst}
        onVerdict={(v) => {
          setDirectionsOpen(false);
          setVerdict(v);
          setCampground(null);
          setSearchPin(null);
          setPanel(null);
        }}
        onCampground={(p) => {
          setDirectionsOpen(false);
          setCampground(p);
          setVerdict(null);
          setSearchPin(null);
          setPanel(null);
        }}
        onLiveStatus={onLiveStatus}
      />

      <TopBar online={online} busy={busy} />

      <SearchBar onSelect={onSearchSelect} />

      <div className="map-fabs">
        <button
          className={`map-fab ${directionsOpen || routeInfo ? "active" : ""}`}
          onClick={() => {
            setVerdict(null);
            setCampground(null);
            setPanel(null);
            setDirectionsOpen((v) => !v);
          }}
          aria-label="Directions"
        >
          🧭
        </button>
        <CameraControls map={mapInst} />
        <button className="map-fab" onClick={() => setTerrain3D((v) => !v)} aria-label="Toggle 3D terrain">
          {terrain3D ? "2D" : "3D"}
        </button>
        <button
          className="map-fab"
          onClick={() => setBasemap((b) => (b === "satellite" ? "topo" : "satellite"))}
          aria-label="Switch basemap"
        >
          {basemap === "satellite" ? "Topo" : "Sat"}
        </button>
      </div>

      {directionsOpen && (
        <DirectionsPanel
          stops={stops}
          routeInfo={routeInfo}
          routing={routing}
          hasGps={!!fix}
          onQuery={onStopQuery}
          onResolve={onStopResolve}
          onClear={onStopClear}
          onUseMyLocation={onUseMyLocation}
          onRemove={onStopRemove}
          onReorder={onReorderStops}
          onAdd={onAddStop}
          onClearAll={clearAll}
          onClose={() => setDirectionsOpen(false)}
        />
      )}

      {!directionsOpen && (routing || routeInfo) && (
        <div className="route-card">
          <button className="route-card-clear" onClick={clearAll} aria-label="Clear route">
            ✕
          </button>
          {routing ? (
            <div className="route-routing">Finding route…</div>
          ) : (
            routeInfo && (
              <>
                <div className="route-total">
                  🚗 {fmtTime(routeInfo.mins)} · {fmtMi(routeInfo.miles)} mi
                </div>
                <div className="route-chunks">
                  {routeInfo.chunks.map((c, i) => (
                    <div className={`route-chunk seg-${c.key}`} key={i}>
                      <span className="chunk-swatch" />
                      <span className="chunk-label">{c.label}</span>
                      <span className="chunk-val">
                        {fmtMi(c.miles)} mi · {fmtTime(c.mins)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="route-actions">
                  <button onClick={() => setDirectionsOpen(true)}>✎ Edit stops</button>
                </div>
              </>
            )
          )}
        </div>
      )}

      {searchPin && !directionsOpen && !routing && !routeInfo && (
        <div className="pin-card" role="dialog" aria-label="Dropped pin">
          <button className="pin-card-close" onClick={() => setSearchPin(null)} aria-label="Remove pin">
            ✕
          </button>
          <div className="pin-card-head">
            <span className="pin-card-dot" aria-hidden />
            <span className="pin-card-name">{/^-?\d/.test(searchPin.label) ? "Dropped pin" : searchPin.label}</span>
          </div>
          <div className="pin-card-coords">
            {searchPin.lat.toFixed(5)}, {searchPin.lng.toFixed(5)}
          </div>
          <div className="pin-card-actions">
            <button className="pin-card-save" onClick={onSavePin} disabled={pinSaved}>
              {pinSaved ? "✓ Saved to My Locations" : "★ Save to My Locations"}
            </button>
            <button
              className="pin-card-secondary"
              onClick={() => routeToPoint(searchPin.lng, searchPin.lat, /^-?\d/.test(searchPin.label) ? "Dropped pin" : searchPin.label)}
            >
              Route here
            </button>
          </div>
        </div>
      )}

      {!verdict && !campground && !panel && !routing && !routeInfo && !directionsOpen && !searchPin && (
        <div className="tap-hint">Tap the map to check camping legality</div>
      )}

      {panel === "layers" && (
        <LayerPanel
          basemap={basemap}
          onBasemap={setBasemap}
          overlays={overlays}
          onOverlay={(id, v) => setOverlays((o) => ({ ...o, [id]: v }))}
          terrain3D={terrain3D}
          onTerrain3D={setTerrain3D}
          roadOpacity={roadOpacity}
          onRoadOpacity={setRoadOpacity}
          sharpenImagery={sharpenImagery}
          onSharpenImagery={setSharpenImagery}
          liveStatus={liveStatus}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "offline" && <OfflinePanel onClose={() => setPanel(null)} onFlyTo={onFlyToRegion} />}
      {panel === "trips" && (
        <TripPanel
          tracks={tracks}
          waypoints={waypoints}
          recording={recording}
          currentCount={recPoints.length}
          onToggleRecord={onToggleRecord}
          onDeleteTrack={(id) => deleteTrack(id).then(() => listTracks().then(setTracks))}
          onDeleteWaypoint={(id) => deleteWaypoint(id).then(() => listWaypoints().then(setWaypoints))}
          onExport={onExport}
          onImport={onImport}
          onPrintGuide={onPrintGuide}
          onFlyToWaypoint={onFlyToWaypoint}
          views={views}
          onSaveView={onSaveView}
          onRestoreView={onRestoreView}
          onDeleteView={(id) => deleteView(id).then(() => listViews().then(setViews))}
          onClose={() => setPanel(null)}
        />
      )}

      {verdict && (
        <VerdictCard
          verdict={verdict}
          origin={routeOrigin}
          onClose={() => setVerdict(null)}
          onSaveWaypoint={onSaveWaypoint}
          onShowRoute={() => routeToPoint(verdict.lngLat.lng, verdict.lngLat.lat, verdict.title || "Camp spot")}
          onSetStart={() => setStartPoint(verdict.lngLat.lng, verdict.lngLat.lat, verdict.title || "Trip start")}
        />
      )}

      {campground && (
        <CampgroundCard
          place={campground}
          origin={routeOrigin}
          onClose={() => setCampground(null)}
          onSavePlace={onSaveCampground}
          onShowRoute={() => routeToPoint(campground.lngLat.lng, campground.lngLat.lat, campground.name || "Campground")}
          onSetStart={() => setStartPoint(campground.lngLat.lng, campground.lngLat.lat, campground.name || "Trip start")}
        />
      )}

      <Toolbar
        active={panel}
        onToggle={(p) => {
          setVerdict(null);
          setCampground(null);
          setPanel((cur) => (cur === p ? null : p));
        }}
        gpsStatus={status}
        onLocate={onLocate}
        recording={recording}
        onToggleRecord={onToggleRecord}
      />
    </div>
  );
}
