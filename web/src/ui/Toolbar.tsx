import type { GpsStatus } from "../gps/useGeolocation";
import { LayersIcon, LocateIcon, RecordIcon, StopIcon, TripIcon, OfflineIcon } from "./icons";

export type PanelId = "layers" | "trips" | "offline";

interface Props {
  active: PanelId | null;
  onToggle: (p: PanelId) => void;
  gpsStatus: GpsStatus;
  onLocate: () => void;
  recording: boolean;
  onToggleRecord: () => void;
}

export function Toolbar(p: Props) {
  const locateClass = p.gpsStatus === "active" ? "active" : p.gpsStatus === "denied" || p.gpsStatus === "error" ? "danger" : "";

  return (
    <nav className="toolbar" aria-label="Tools">
      <button data-verify="tool-layers" className={`tool ${p.active === "layers" ? "active" : ""}`} onClick={() => p.onToggle("layers")}>
        <LayersIcon />
        <span>Layers</span>
      </button>

      <button data-verify="tool-locate" className={`tool ${locateClass}`} onClick={p.onLocate}>
        <LocateIcon />
        <span>{p.gpsStatus === "active" ? "Following" : "Locate"}</span>
      </button>

      <button data-verify="tool-record" className={`tool record ${p.recording ? "recording" : ""}`} onClick={p.onToggleRecord}>
        {p.recording ? <StopIcon /> : <RecordIcon />}
        <span>{p.recording ? "Stop" : "Record"}</span>
      </button>

      <button data-verify="tool-trips" className={`tool ${p.active === "trips" ? "active" : ""}`} onClick={() => p.onToggle("trips")}>
        <TripIcon />
        <span>Trips</span>
      </button>

      <button data-verify="tool-offline" className={`tool ${p.active === "offline" ? "active" : ""}`} onClick={() => p.onToggle("offline")}>
        <OfflineIcon />
        <span>Offline</span>
      </button>
    </nav>
  );
}
