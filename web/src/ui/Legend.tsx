import { MANAGER_ORDER, MANAGERS } from "../map/managers";

// Only the managers you actually encounter dispersed-camping-wise lead the list.
const SHOWN = MANAGER_ORDER.filter((m) => m !== "OTHER");

export function Legend() {
  return (
    <div className="legend">
      <h4 className="legend-title">Land manager</h4>
      <div className="legend-grid">
        {SHOWN.map((m) => (
          <div className="legend-row" key={m}>
            <span className="legend-swatch" style={{ background: MANAGERS[m].color }} />
            <span className="legend-label">{MANAGERS[m].label}</span>
          </div>
        ))}
      </div>
      <h4 className="legend-title">Routes (MVUM)</h4>
      <div className="legend-grid">
        <div className="legend-row">
          <span className="legend-line" style={{ background: "#4AA3F0" }} />
          <span className="legend-label">Open to all vehicles</span>
        </div>
        <div className="legend-row">
          <span className="legend-line" style={{ background: "#2D6BB8" }} />
          <span className="legend-label">High-clearance only</span>
        </div>
        <div className="legend-row">
          <span className="legend-line dashed" />
          <span className="legend-label">OHV trail</span>
        </div>
      </div>
      <h4 className="legend-title">Campgrounds</h4>
      <div className="legend-grid">
        <div className="legend-row">
          <span className="legend-swatch circle" style={{ background: "#f1d59a" }} />
          <span className="legend-label">USFS</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch circle" style={{ background: "#e0a93b" }} />
          <span className="legend-label">BLM</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch circle" style={{ background: "#77c7e8" }} />
          <span className="legend-label">California</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch circle" style={{ background: "#94d37b" }} />
          <span className="legend-label">Washington</span>
        </div>
      </div>
      <h4 className="legend-title">Trails &amp; landmarks</h4>
      <div className="legend-grid">
        <div className="legend-row">
          <span
            className="legend-line"
            style={{ background: "repeating-linear-gradient(90deg, #EC7A3D 0 4px, transparent 4px 7px)", borderRadius: 0 }}
          />
          <span className="legend-label">Hiking trail</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch circle" style={{ background: "#d8c3a5" }} />
          <span className="legend-label">Peak / summit</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch circle" style={{ background: "#5aa9e0" }} />
          <span className="legend-label">Lake</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch circle" style={{ background: "#5fbf74" }} />
          <span className="legend-label">Trailhead</span>
        </div>
      </div>
    </div>
  );
}
