import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { MAX_PITCH } from "../map/MapView";

interface Props {
  map: MLMap | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const PITCH_STEP = 15;

// Compass (drag = rotate, vertical drag = tilt, tap = north-up) + a pitch rocker.
export function CameraControls({ map }: Props) {
  const [bearing, setBearing] = useState(0);
  const [pitch, setPitch] = useState(0);
  const drag = useRef<{ x: number; y: number; b: number; p: number; moved: boolean } | null>(null);
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!map) return;
    const update = () => {
      setBearing(map.getBearing());
      setPitch(map.getPitch());
    };
    update();
    map.on("rotate", update);
    map.on("pitch", update);
    return () => {
      map.off("rotate", update);
      map.off("pitch", update);
    };
  }, [map]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!map) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, b: map.getBearing(), p: map.getPitch(), moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!map || !d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    map.setBearing(d.b + dx * 0.7); // drag sideways → spin
    map.setPitch(clamp(d.p - dy * 0.5, 0, MAX_PITCH)); // drag up → tilt toward horizon
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (map && d && !d.moved) map.easeTo({ bearing: 0, duration: 400 }); // tap → north up
  };

  const nudgePitch = (delta: number) => {
    if (!map) return;
    map.easeTo({ pitch: clamp(map.getPitch() + delta, 0, MAX_PITCH), duration: 150 });
  };

  // Lower/raise the camera = zoom in/out (MapLibre has no free-camera altitude;
  // zooming in brings the eye down toward the terrain). +delta lowers the camera.
  const adjustHeight = (deltaZoom: number) => {
    if (!map) return;
    map.easeTo({ zoom: clamp(map.getZoom() + deltaZoom, 3, 20), duration: 150 });
  };

  const startHold = (fn: () => void) => {
    fn();
    hold.current = setInterval(fn, 170);
  };
  const stopHold = () => {
    if (hold.current) clearInterval(hold.current);
    hold.current = null;
  };

  return (
    <>
      <button
        className="map-fab compass"
        aria-label="Rotate map (drag); tap for north up"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="compass-rose" style={{ transform: `rotate(${-bearing}deg)` }}>
          <span className="compass-n" />
          <span className="compass-s" />
        </span>
      </button>

      <div className="pitch-rocker">
        <button
          className="pitch-btn"
          aria-label="Tilt up"
          disabled={!map || pitch >= MAX_PITCH - 0.5}
          onPointerDown={() => startHold(() => nudgePitch(PITCH_STEP))}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
        >
          ⌃
        </button>
        <span className="pitch-readout">{Math.round(pitch)}°</span>
        <button
          className="pitch-btn"
          aria-label="Tilt down"
          disabled={!map || pitch <= 0.5}
          onPointerDown={() => startHold(() => nudgePitch(-PITCH_STEP))}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
        >
          ⌄
        </button>
      </div>

      <div className="pitch-rocker">
        <button
          className="pitch-btn"
          aria-label="Raise camera"
          disabled={!map}
          onPointerDown={() => startHold(() => adjustHeight(-0.6))}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
        >
          ⤒
        </button>
        <span className="pitch-readout">eye</span>
        <button
          className="pitch-btn"
          aria-label="Lower camera"
          disabled={!map}
          onPointerDown={() => startHold(() => adjustHeight(0.6))}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
        >
          ⤓
        </button>
      </div>
    </>
  );
}
