import { useRef, useState } from "react";
import { parseCoords } from "./geocode";

interface NomResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface Props {
  onSelect: (lng: number, lat: number, label: string) => void;
  /** "origin" = the search is setting the trip START, not just panning the map. */
  mode?: "go" | "origin";
  onCancel?: () => void;
}

// Place search via OpenStreetMap Nominatim (key-free). Debounced, US-only.
export function SearchBar({ onSelect, mode = "go", onCancel }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<NomResult[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = mode === "origin";
  const coord = parseCoords(q);

  function goToCoord(c: { lat: number; lng: number }) {
    onSelect(c.lng, c.lat, `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
    setOpen(false);
    setQ(origin ? "" : `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
  }

  async function run(query: string) {
    const c = parseCoords(query);
    if (c) {
      goToCoord(c);
      return;
    }
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=us`;
      const res = await fetch(url);
      const data = (await res.json()) as NomResult[];
      setResults(data);
      setOpen(true);
    } catch {
      setResults([]);
    }
  }

  function onChange(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(v), 450);
  }

  return (
    <div className={`search ${origin ? "origin-mode" : ""}`}>
      {origin ? <span className="search-badge">◉ Start from</span> : <span className="search-icon" aria-hidden>⌕</span>}
      <input
        className="search-input"
        value={q}
        autoFocus={origin}
        placeholder={origin ? "Search or paste lat, lon" : "Search a place, or paste lat, lon"}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        enterKeyHint="search"
        onKeyDown={(e) => e.key === "Enter" && run(q)}
      />
      {origin ? (
        <button className="search-clear" aria-label="Cancel" onClick={() => onCancel?.()}>
          ✕
        </button>
      ) : (
        q && (
          <button
            className="search-clear"
            aria-label="Clear search"
            onClick={() => {
              setQ("");
              setResults([]);
              setOpen(false);
            }}
          >
            ✕
          </button>
        )
      )}
      {coord && (
        <ul className="search-results">
          <li onClick={() => goToCoord(coord)}>
            ◎ Go to {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
          </li>
        </ul>
      )}
      {!coord && open && results.length > 0 && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li
              key={i}
              onClick={() => {
                onSelect(parseFloat(r.lon), parseFloat(r.lat), r.display_name.split(",")[0]);
                setOpen(false);
                setQ(origin ? "" : r.display_name.split(",")[0]);
              }}
            >
              {r.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
