import { useCallback, useEffect, useRef, useState } from "react";
import { parseCoords, searchPlaces, type Place } from "./geocode";
import { fmtTime, fmtMi, type RouteResult } from "../map/routing";

export interface Stop {
  id: string;
  query: string; // raw text in the field
  point: { lng: number; lat: number } | null; // resolved coordinate (null until picked)
  label: string; // display name of the resolved point
}

/** Badge shown on the map pin + list bullet: A/B for a simple trip, else 1..n. */
export function stopBadge(index: number, total: number): string {
  if (total <= 2) return index === 0 ? "A" : "B";
  return String(index + 1);
}

function stopKind(index: number, total: number): "start" | "end" | "via" {
  if (index === 0) return "start";
  if (index === total - 1) return "end";
  return "via";
}

interface RowProps {
  index: number;
  total: number;
  stop: Stop;
  hasGps: boolean;
  dragging: boolean;
  onGripDown: (i: number, e: React.PointerEvent) => void;
  onQuery: (i: number, q: string) => void;
  onResolve: (i: number, lng: number, lat: number, label: string) => void;
  onClear: (i: number) => void;
  onUseMyLocation: (i: number) => void;
  onRemove: (i: number) => void;
}

function StopRow(p: RowProps) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const kind = stopKind(p.index, p.total);
  const placeholder = kind === "start" ? "Start — address or lat, lon" : kind === "end" ? "Destination — address or lat, lon" : "Stop — address or lat, lon";

  async function run(query: string) {
    const c = parseCoords(query);
    if (c) {
      p.onResolve(p.index, c.lng, c.lat, `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
      setResults([]);
      setOpen(false);
      return;
    }
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    try {
      const r = await searchPlaces(query);
      setResults(r);
      setOpen(true);
    } catch {
      setResults([]);
    }
  }

  function onChange(v: string) {
    p.onQuery(p.index, v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(v), 450);
  }

  return (
    <div className={`dir-row ${p.dragging ? "dragging" : ""}`}>
      <span
        className="dir-grip"
        role="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        onPointerDown={(e) => p.onGripDown(p.index, e)}
      >
        ⠿
      </span>
      <span className={`dir-badge ${kind}`}>{stopBadge(p.index, p.total)}</span>
      <div className="dir-field">
        <input
          className="dir-input"
          value={p.stop.query}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          enterKeyHint="search"
          onKeyDown={(e) => e.key === "Enter" && run(p.stop.query)}
        />
        {open && results.length > 0 && (
          <ul className="dir-results">
            {results.map((r, i) => (
              <li
                key={i}
                onClick={() => {
                  p.onResolve(p.index, r.lng, r.lat, r.label.split(",")[0]);
                  setOpen(false);
                  setResults([]);
                }}
              >
                {r.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {p.hasGps && (
        <button className="dir-mini" title="Use my location" aria-label="Use my location" onClick={() => p.onUseMyLocation(p.index)}>
          ⌖
        </button>
      )}
      {p.stop.query ? (
        <button className="dir-mini" aria-label="Clear this stop" onClick={() => p.onClear(p.index)}>
          ✕
        </button>
      ) : (
        p.total > 2 && (
          <button className="dir-mini" aria-label="Remove this stop" onClick={() => p.onRemove(p.index)}>
            −
          </button>
        )
      )}
    </div>
  );
}

interface Props {
  stops: Stop[];
  routeInfo: RouteResult | null;
  routing: boolean;
  hasGps: boolean;
  onQuery: (i: number, q: string) => void;
  onResolve: (i: number, lng: number, lat: number, label: string) => void;
  onClear: (i: number) => void;
  onUseMyLocation: (i: number) => void;
  onRemove: (i: number) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: () => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function DirectionsPanel(p: Props) {
  const placed = p.stops.filter((s) => s.point);
  const resolved = placed.length;
  const rowsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null); // stable across renders for the window listeners
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const onReorderRef = useRef(p.onReorder);
  onReorderRef.current = p.onReorder;

  // Pointer-based drag reorder (works on touch + mouse; no library). The dragged
  // row's coordinates keep their identity, so the route effect recomputes on drop.
  const handleMove = useCallback((e: PointerEvent) => {
    const from = dragRef.current;
    const rows = rowsRef.current?.children;
    if (from == null || !rows) return;
    let to = rows.length - 1;
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        to = j;
        break;
      }
    }
    if (to !== from) {
      onReorderRef.current(from, to);
      dragRef.current = to;
      setDragIdx(to);
    }
  }, []);
  const handleUp = useCallback(() => {
    dragRef.current = null;
    setDragIdx(null);
    window.removeEventListener("pointermove", handleMove);
  }, [handleMove]);
  const onGripDown = useCallback(
    (i: number, e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = i;
      setDragIdx(i);
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp, { once: true });
    },
    [handleMove, handleUp],
  );
  useEffect(() => () => window.removeEventListener("pointermove", handleMove), [handleMove]);

  return (
    <section className="dir-panel" aria-label="Directions">
      <header className="dir-head">
        <h3>Directions</h3>
        <button className="icon-btn" onClick={p.onClose} aria-label="Close directions">
          ✕
        </button>
      </header>

      <div className="dir-rows" ref={rowsRef}>
        {p.stops.map((s, i) => (
          <StopRow
            key={s.id}
            index={i}
            total={p.stops.length}
            stop={s}
            hasGps={p.hasGps}
            dragging={dragIdx === i}
            onGripDown={onGripDown}
            onQuery={p.onQuery}
            onResolve={p.onResolve}
            onClear={p.onClear}
            onUseMyLocation={p.onUseMyLocation}
            onRemove={p.onRemove}
          />
        ))}
      </div>

      <div className="dir-actions">
        <button className="dir-add" onClick={p.onAdd}>
          ＋ Add stop
        </button>
        {resolved > 0 && (
          <button className="dir-clear" onClick={p.onClearAll}>
            Clear
          </button>
        )}
      </div>

      {p.routing && <div className="dir-status">Finding route…</div>}
      {!p.routing && p.routeInfo && (
        <div className="dir-summary">
          <div className="dir-total">
            🚗 {fmtTime(p.routeInfo.mins)} · {fmtMi(p.routeInfo.miles)} mi total
          </div>

          {p.routeInfo.legs.length > 1 && (
            <div className="dir-legs">
              {p.routeInfo.legs.map((leg, j) => (
                <div className="dir-leg" key={j}>
                  <span className="dir-leg-badges">
                    <span className={`dir-badge sm ${j === 0 ? "start" : ""}`}>{stopBadge(j, placed.length)}</span>
                    <span className="dir-leg-arrow">→</span>
                    <span className={`dir-badge sm ${j + 1 === placed.length - 1 ? "end" : ""}`}>{stopBadge(j + 1, placed.length)}</span>
                  </span>
                  <span className="dir-leg-name">{placed[j + 1]?.label || `Stop ${j + 2}`}</span>
                  <span className="dir-leg-val">
                    {fmtMi(leg.miles)} mi · {fmtTime(leg.mins)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="dir-chunks">
            {p.routeInfo.chunks.map((c, i) => (
              <div className={`route-chunk seg-${c.key}`} key={i}>
                <span className="chunk-swatch" />
                <span className="chunk-label">{c.label}</span>
                <span className="chunk-val">
                  {fmtMi(c.miles)} mi · {fmtTime(c.mins)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!p.routing && !p.routeInfo && resolved < 2 && (
        <p className="dir-hint">Fill in a start and destination to see the drive. Type an address or paste lat, lon.</p>
      )}
    </section>
  );
}
