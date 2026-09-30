import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  KIND_META,
  OVERSCAN,
  RAIL_KINDS,
  ROW_HEIGHT,
  VIRTUALIZE_ABOVE,
  formatMiles,
  formatStatLine,
  selectRailItems,
  sliceWindow,
  type RailItem,
  type RailKind,
} from "./results-rail.logic.ts";
import "./results-rail.css";

// Re-exported so callers only ever import from the component file. The helpers
// live in results-rail.logic.ts so plain node can run the self-check on them.
export {
  CAMPGROUND_SWATCH,
  KIND_META,
  MVUM_ROAD_SWATCH,
  OVERSCAN,
  POI_SWATCH,
  RAIL_KINDS,
  ROW_HEIGHT,
  VIRTUALIZE_ABOVE,
  countByKind,
  filterByKinds,
  filterByQuery,
  formatMiles,
  formatStatLine,
  matchesQuery,
  railSwatchColor,
  selectRailItems,
  sliceWindow,
  tokenize,
  totalsFor,
} from "./results-rail.logic.ts";
export type { KindCounts, RailItem, RailKind, RailKindMeta, RailSelection, RailTotals, RailWindow } from "./results-rail.logic.ts";

export interface ResultsRailProps {
  /** Every feature currently in the viewport, already flattened by the parent. */
  items: RailItem[];
  /** Id of the feature the map (or this rail) is currently highlighting. */
  hoveredId: string | null;
  /** Fired on pointer-over and on keyboard focus, and with null when both end. */
  onHover: (id: string | null) => void;
  /** Fired on click, and on Enter or Space, because each row is a real button. */
  onSelect: (id: string) => void;
  /** Id of the tapped feature, drawn as a persistent mark under the hover state. */
  selectedId?: string | null;
  loading?: boolean;
  /** Heading above the stat line. Defaults to "In view". */
  title?: string;
  /** Placement hook for the parent. The rail styles itself, not its position. */
  className?: string;
}

function cssVar(name: string, value: string): CSSProperties {
  return { [name]: value } as CSSProperties;
}

function railIdFrom(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const row = target.closest("[data-rail-id]");
  return row instanceof HTMLElement ? row.dataset.railId ?? null : null;
}

interface RowProps {
  item: RailItem;
  index: number;
  hovered: boolean;
  selected: boolean;
}

/**
 * Memoized so a hover only re-renders the row leaving and the row entering.
 * No function props, so the default shallow compare is enough. Every handler
 * is delegated to the list container instead.
 */
const Row = memo(function Row({ item, index, hovered, selected }: RowProps) {
  const meta = KIND_META[item.kind];
  const color = item.swatchColor ?? meta.color;
  const dashed = item.dashed ?? meta.dashed;
  const length = formatMiles(item.miles);

  return (
    <li className="rail-row" style={{ height: ROW_HEIGHT }}>
      <button
        type="button"
        className={`rail-row-btn${hovered ? " hovered" : ""}${selected ? " selected" : ""}`}
        data-rail-id={item.id}
        data-rail-index={index}
        aria-current={selected ? "true" : undefined}
      >
        <span
          className={`rail-swatch ${meta.shape}${dashed ? " dashed" : ""}`}
          style={cssVar("--rail-swatch", color)}
          aria-hidden="true"
        />
        <span className="rail-text">
          <span className="rail-name">{item.name}</span>
          {item.subLabel && <span className="rail-sub">{item.subLabel}</span>}
        </span>
        {length && <span className="rail-miles">{length}</span>}
      </button>
    </li>
  );
});

export function ResultsRail({
  items,
  hoveredId,
  onHover,
  onSelect,
  selectedId = null,
  loading = false,
  title = "In view",
  className,
}: ResultsRailProps) {
  const [query, setQuery] = useState("");
  const [activeKinds, setActiveKinds] = useState<RailKind[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const listRef = useRef<HTMLUListElement>(null);
  const rafRef = useRef<number | null>(null);
  const pointerInsideRef = useRef(false);
  const lastHoverRef = useRef<string | null>(null);

  // Stable handlers: the callbacks are read through refs so the delegated
  // listeners never need to be rebuilt, and Row never sees a changing prop.
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const { visible, counts, totals } = useMemo(() => selectRailItems(items, query, activeKinds), [items, query, activeKinds]);

  // Keep the dedupe ref honest when the parent drives the hover from the map,
  // so the next pointer-out still emits null.
  useEffect(() => {
    lastHoverRef.current = hoveredId;
  }, [hoveredId]);

  const emitHover = useCallback((id: string | null) => {
    if (lastHoverRef.current === id) return;
    lastHoverRef.current = id;
    onHoverRef.current(id);
  }, []);

  const handleScroll = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const node = listRef.current;
      if (node) setScrollTop(node.scrollTop);
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => setViewportH(el.clientHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A filter change can leave the list scrolled past its new end.
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollTop > visible.length * ROW_HEIGHT) el.scrollTop = 0;
  }, [visible.length]);

  const virtual = visible.length > VIRTUALIZE_ABOVE;
  const win = virtual
    ? sliceWindow(visible.length, scrollTop, viewportH || ROW_HEIGHT * 10, ROW_HEIGHT, OVERSCAN, focusIndex)
    : { start: 0, end: visible.length, padTop: 0, padBottom: 0 };

  // Arrow keys move focus to a row the window may not have mounted yet, so the
  // slice above force-includes it and this effect can focus it immediately.
  useEffect(() => {
    if (focusIndex == null) return;
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-rail-index="${focusIndex}"]`);
    el?.focus();
    setFocusIndex(null);
  }, [focusIndex]);

  // Map to rail: when the parent hovers a feature on the map, reveal its row.
  // Skipped while the pointer is in the rail so it never fights the user.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !hoveredId || pointerInsideRef.current) return;
    const idx = visible.findIndex((i) => i.id === hoveredId);
    if (idx < 0) return;
    const rowTop = idx * ROW_HEIGHT;
    if (rowTop < el.scrollTop || rowTop + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, rowTop - el.clientHeight / 2 + ROW_HEIGHT / 2);
    }
  }, [hoveredId, visible]);

  const toggleKind = useCallback((kind: RailKind) => {
    setActiveKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));
  }, []);

  const resetFilters = useCallback(() => {
    setQuery("");
    setActiveKinds([]);
  }, []);

  const onPointerOver = useCallback(
    (e: React.PointerEvent) => {
      pointerInsideRef.current = true;
      emitHover(railIdFrom(e.target));
    },
    [emitHover],
  );

  const onPointerLeave = useCallback(() => {
    pointerInsideRef.current = false;
    emitHover(null);
  }, [emitHover]);

  const onFocusRow = useCallback(
    (e: React.FocusEvent) => {
      const id = railIdFrom(e.target);
      if (id) emitHover(id);
    },
    [emitHover],
  );

  const onBlurRow = useCallback(
    (e: React.FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) emitHover(null);
    },
    [emitHover],
  );

  const onClickRow = useCallback((e: React.MouseEvent) => {
    const id = railIdFrom(e.target);
    if (id) onSelectRef.current(id);
  }, []);

  const onKeyDownRow = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const id = railIdFrom(e.target);
      if (!id) return;
      const cur = visible.findIndex((i) => i.id === id);
      if (cur < 0) return;
      const next = e.key === "ArrowDown" ? Math.min(visible.length - 1, cur + 1) : Math.max(0, cur - 1);
      if (next === cur) return;
      e.preventDefault();
      setFocusIndex(next);
    },
    [visible],
  );

  const filtered = query.trim().length > 0 || activeKinds.length > 0;
  const slice = visible.slice(win.start, win.end);

  return (
    <aside data-panel="results-rail" className={`rail${className ? ` ${className}` : ""}`} aria-label="Features in view">
      <header className="rail-head">
        <div className="rail-head-text">
          <h3 className="rail-title">{title}</h3>
          {/* No aria-live here on purpose: this line changes on every pan, and a
              live region that fires while the map moves is pure noise. */}
          <p className="rail-stat">{loading && items.length === 0 ? "Reading the viewport" : formatStatLine(totals)}</p>
        </div>
        {filtered && (
          <button type="button" className="rail-reset" onClick={resetFilters}>
            Reset
          </button>
        )}
      </header>

      <label className="rail-field">
        <span className="rail-sr-only">Filter features by name</span>
        <input
          className="rail-input"
          type="search"
          value={query}
          placeholder="Filter by name or number"
          enterKeyHint="search"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="rail-chips" role="group" aria-label="Filter by feature type">
        {RAIL_KINDS.map((kind) => {
          const meta = KIND_META[kind];
          const active = activeKinds.includes(kind);
          const count = counts[kind];
          return (
            <button
              type="button"
              key={kind}
              className={`rail-chip${active ? " active" : ""}${count === 0 ? " vacant" : ""}`}
              aria-pressed={active}
              aria-label={`${meta.label}, ${count} in view`}
              onClick={() => toggleKind(kind)}
            >
              <span
                className={`rail-swatch ${meta.shape}${meta.dashed ? " dashed" : ""}`}
                style={cssVar("--rail-swatch", meta.color)}
                aria-hidden="true"
              />
              <span className="rail-chip-label">{meta.short}</span>
              <span className="rail-chip-count">{count}</span>
            </button>
          );
        })}
      </div>

      <ul
        ref={listRef}
        className="rail-list"
        style={cssVar("--rail-row-h", `${ROW_HEIGHT}px`)}
        onScroll={handleScroll}
        onPointerOver={onPointerOver}
        onPointerLeave={onPointerLeave}
        onFocus={onFocusRow}
        onBlur={onBlurRow}
        onClick={onClickRow}
        onKeyDown={onKeyDownRow}
      >
        {win.padTop > 0 && <li className="rail-pad" style={{ height: win.padTop }} aria-hidden="true" />}
        {slice.map((item, i) => (
          <Row
            key={item.id}
            item={item}
            index={win.start + i}
            hovered={item.id === hoveredId}
            selected={item.id === selectedId}
          />
        ))}
        {win.padBottom > 0 && <li className="rail-pad" style={{ height: win.padBottom }} aria-hidden="true" />}
      </ul>

      {visible.length === 0 && (
        <p className="rail-empty">
          {loading ? "Loading features" : filtered ? "Nothing matches that filter." : "Pan or zoom in to pull features here."}
        </p>
      )}
    </aside>
  );
}
