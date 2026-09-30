import { BASEMAPS } from "../map/style";
import type { BasemapId, OverlayId } from "../map/ids";
import type { LayerKey, LoadStatus } from "../map/liveData";
import { Legend } from "../ui/Legend";

type OverlayRow = { id: OverlayId; label: string; sublabel: string; live?: LayerKey };

// Grouped so the toggle list reads as an organized system, not a flat wall of switches.
const OVERLAY_GROUPS: { group: string; rows: OverlayRow[] }[] = [
  {
    group: "Public land & camping",
    rows: [
      { id: "ownership", label: "Public land", sublabel: "Ownership by agency", live: "ownership" },
      { id: "wilderness", label: "Wilderness", sublabel: "No vehicle camping", live: "wilderness" },
      { id: "campgrounds", label: "Campgrounds", sublabel: "Federal and state sites", live: "campgrounds" },
      { id: "corridors", label: "Camp corridors", sublabel: "Likely-legal dispersed zones" },
    ],
  },
  {
    group: "Roads & trails",
    rows: [
      { id: "mvumRoads", label: "Forest roads (MVUM)", sublabel: "USFS motorized", live: "mvumRoads" },
      { id: "blmRoads", label: "BLM roads", sublabel: "Public motorized", live: "blmRoads" },
      { id: "mvumTrails", label: "Forest trails (OHV)", sublabel: "USFS motorized trails", live: "mvumTrails" },
      { id: "trails", label: "Hiking trails", sublabel: "USFS foot/system trails", live: "trails" },
    ],
  },
  {
    group: "Landmarks & terrain",
    rows: [
      { id: "poi", label: "Peaks, lakes & trailheads", sublabel: "Named natural features", live: "poi" },
      { id: "roads", label: "Roads & highways", sublabel: "Streets + labels over imagery" },
      { id: "hillshade", label: "Hillshade", sublabel: "Terrain shading" },
    ],
  },
];

function statusText(s: LoadStatus | undefined, count: number): string {
  switch (s) {
    case "loading":
      return "loading…";
    case "ok":
      return `${count.toLocaleString()} loaded`;
    case "empty":
      return "none in view";
    case "zoomin":
      return "zoom in to load";
    case "error":
      return "load error";
    default:
      return "";
  }
}

interface Props {
  basemap: BasemapId;
  onBasemap: (b: BasemapId) => void;
  overlays: Record<OverlayId, boolean>;
  onOverlay: (id: OverlayId, v: boolean) => void;
  terrain3D: boolean;
  onTerrain3D: (v: boolean) => void;
  roadOpacity: number;
  onRoadOpacity: (v: number) => void;
  sharpenImagery: boolean;
  onSharpenImagery: (v: boolean) => void;
  liveStatus: Partial<Record<LayerKey, { status: LoadStatus; count: number }>>;
  onClose: () => void;
}

export function LayerPanel(p: Props) {
  return (
    <section className="panel" aria-label="Map layers">
      <header className="panel-head">
        <h3>Map &amp; layers</h3>
        <button className="icon-btn" onClick={p.onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="panel-body">
        <h4 className="group-label">Basemap</h4>
        <div className="basemap-grid">
          {BASEMAPS.map((b) => (
            <button
              key={b.id}
              className={`basemap-chip ${p.basemap === b.id ? "active" : ""}`}
              onClick={() => p.onBasemap(b.id)}
            >
              <span className="chip-label">{b.label}</span>
              <span className="chip-sub">{b.sublabel}</span>
            </button>
          ))}
        </div>

        {OVERLAY_GROUPS.map((g) => (
          <div key={g.group}>
            <h4 className="group-label">{g.group}</h4>
            <div className="toggle-list">
              {g.rows.map((o) => {
                const st = o.live ? p.liveStatus[o.live] : undefined;
                return (
                  <label className="toggle-row" key={o.id}>
                    <span className="toggle-text">
                      <span className="toggle-label">{o.label}</span>
                      <span className="toggle-sub">
                        {o.sublabel}
                        {o.live && p.overlays[o.id] && st ? ` · ${statusText(st.status, st.count)}` : ""}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      className="switch"
                      data-verify={`overlay-${o.id}`}
                      checked={p.overlays[o.id]}
                      onChange={(e) => p.onOverlay(o.id, e.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        <h4 className="group-label">Map settings</h4>
        <div className="toggle-list">
          <label className="toggle-row">
            <span className="toggle-text">
              <span className="toggle-label">3D terrain</span>
              <span className="toggle-sub">Tilt &amp; relief</span>
            </span>
            <input type="checkbox" className="switch" checked={p.terrain3D} onChange={(e) => p.onTerrain3D(e.target.checked)} />
          </label>

          <label className="toggle-row">
            <span className="toggle-text">
              <span className="toggle-label">Sharpen imagery</span>
              <span className="toggle-sub">Crisper when zoomed past z19</span>
            </span>
            <input type="checkbox" className="switch" checked={p.sharpenImagery} onChange={(e) => p.onSharpenImagery(e.target.checked)} />
          </label>

          <div className="slider-row">
            <div className="slider-head">
              <span className="toggle-label">Road opacity</span>
              <span className="slider-val">{Math.round(p.roadOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              className="slider"
              min={0}
              max={1}
              step={0.05}
              value={p.roadOpacity}
              onChange={(e) => p.onRoadOpacity(Number(e.target.value))}
            />
          </div>
        </div>

        <Legend />
      </div>
    </section>
  );
}
