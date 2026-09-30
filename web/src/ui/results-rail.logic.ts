// Pure logic behind <ResultsRail>. No React, no DOM, no map reference.
//
// This lives in its own .ts (rather than inside ResultsRail.tsx) for one reason:
// Node 23.6+ strips TypeScript types natively, so `results-rail.selfcheck.mjs`
// can import these helpers directly and assert on them. A .tsx cannot be
// imported that way because of the JSX. ResultsRail.tsx re-exports everything
// here, so the component file is still the public entry point.

/**
 * Feature families the rail can show. These are the live-data keys from
 * `map/liveData.ts` (`LayerKey`), minus the polygon-only layers (`ownership`,
 * `wilderness`) which have no per-row identity in a results list.
 */
export type RailKind = "mvumRoads" | "blmRoads" | "mvumTrails" | "trails" | "campgrounds" | "poi";

export const RAIL_KINDS: RailKind[] = ["mvumRoads", "blmRoads", "mvumTrails", "trails", "campgrounds", "poi"];

export interface RailKindMeta {
  /** Full name, used for the chip's accessible label. */
  label: string;
  /** Short name that fits on a chip. */
  short: string;
  /** Default swatch color, matching how `map/layers.ts` paints this family. */
  color: string;
  /** Linear features get a line swatch, point features get a dot. */
  shape: "line" | "dot";
  /** Line swatches that the map draws with a `line-dasharray`. */
  dashed: boolean;
}

/**
 * Every color below is lifted from `map/layers.ts` so a row's swatch is the
 * same ink the map used to draw that feature.
 */
export const KIND_META: Record<RailKind, RailKindMeta> = {
  // mvumRoadColor, "open" branch. Restricted roads use MVUM_ROAD_SWATCH below.
  mvumRoads: { label: "Forest roads (MVUM)", short: "Roads", color: "#4AA3F0", shape: "line", dashed: false },
  // LYR.blmRoads line-color, deliberately the same blue so roads read as one network.
  blmRoads: { label: "BLM roads (GTLF)", short: "BLM", color: "#4AA3F0", shape: "line", dashed: false },
  // LYR.mvumTrails line-color, dasharray [2, 1.4].
  mvumTrails: { label: "OHV trails", short: "OHV", color: "#B57BD0", shape: "line", dashed: true },
  // LYR.trails line-color, dasharray [1.5, 1.2].
  trails: { label: "Hiking trails", short: "Trails", color: "#EC7A3D", shape: "line", dashed: true },
  // campgroundColor fallback (USFS).
  campgrounds: { label: "Campgrounds", short: "Camps", color: "#f1d59a", shape: "dot", dashed: false },
  // poiColor fallback (peak).
  poi: { label: "Peaks, lakes and trailheads", short: "Places", color: "#d8c3a5", shape: "dot", dashed: false },
};

/** `mvumRoadColor` in layers.ts, keyed by the `passengervehicle` property. */
export const MVUM_ROAD_SWATCH: Record<string, string> = {
  open: "#4AA3F0",
  restricted: "#2D6BB8",
};

/** `campgroundColor` in layers.ts, keyed by the `agency` property. */
export const CAMPGROUND_SWATCH: Record<string, string> = {
  USFS: "#f1d59a",
  BLM: "#e0a93b",
  "CA State Parks": "#77c7e8",
  "WA State Parks": "#94d37b",
};

/** `poiColor` in layers.ts, keyed by the `poiKind` property. */
export const POI_SWATCH: Record<string, string> = {
  peak: "#d8c3a5",
  lake: "#5aa9e0",
  trailhead: "#5fbf74",
};

/**
 * Pick the honest swatch for a feature: the map's per-value color when `tag`
 * matches a styled value, otherwise the family default.
 *
 * `tag` is whichever property drives the color on the map, so
 * `passengervehicle` for MVUM roads, `agency` for campgrounds, `poiKind` for
 * POIs. Roads styled by GTLF have a single color and ignore it.
 */
export function railSwatchColor(kind: RailKind, tag?: string | null): string {
  const fallback = KIND_META[kind].color;
  if (!tag) return fallback;
  if (kind === "mvumRoads") return MVUM_ROAD_SWATCH[tag] ?? fallback;
  if (kind === "campgrounds") return CAMPGROUND_SWATCH[tag] ?? fallback;
  if (kind === "poi") return POI_SWATCH[tag] ?? fallback;
  return fallback;
}

/** One row. The parent owns identity; the rail never invents or fetches one. */
export interface RailItem {
  /** Stable across renders, and the same id the parent uses to highlight the map. */
  id: string;
  kind: RailKind;
  name: string;
  /** Small second line: route number, agency, surface, whatever the source gives. */
  subLabel?: string;
  /** Length in miles. Points (campgrounds, POIs) leave this undefined. */
  miles?: number;
  /** Defaults to the family color from KIND_META when omitted. */
  swatchColor?: string;
  /** Defaults to the family's dash state from KIND_META when omitted. */
  dashed?: boolean;
}

export interface RailTotals {
  count: number;
  miles: number;
}

export type KindCounts = Record<RailKind, number>;

export interface RailSelection {
  /** Rows that survive both the text query and the chip selection. */
  visible: RailItem[];
  /** Per-kind counts AFTER the text query but BEFORE the chip selection, so an
   *  unselected chip still shows how many rows picking it would add. */
  counts: KindCounts;
  /** Totals for `visible`, so the header stat line always describes the list. */
  totals: RailTotals;
}

/** Fixed row height in px. The CSS reads it back as the `--rail-row-h` custom
 *  property, so windowing math and layout cannot drift apart. */
export const ROW_HEIGHT = 46;

/** Rows rendered above and below the viewport so a fast scroll stays filled. */
export const OVERSCAN = 6;

/** Below this many rows, windowing costs more than it saves. */
export const VIRTUALIZE_ABOVE = 60;

export function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesQuery(item: RailItem, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = `${item.name} ${item.subLabel ?? ""}`.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export function filterByQuery(items: RailItem[], query: string): RailItem[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return items;
  return items.filter((item) => matchesQuery(item, tokens));
}

/** An empty or null kind list means "no chip is pressed", which shows everything. */
export function filterByKinds(items: RailItem[], kinds: readonly RailKind[] | null): RailItem[] {
  if (!kinds || kinds.length === 0) return items;
  const set = new Set(kinds);
  return items.filter((item) => set.has(item.kind));
}

export function countByKind(items: RailItem[]): KindCounts {
  const counts = {} as KindCounts;
  for (const kind of RAIL_KINDS) counts[kind] = 0;
  for (const item of items) {
    if (item.kind in counts) counts[item.kind] += 1;
  }
  return counts;
}

export function totalsFor(items: RailItem[]): RailTotals {
  let miles = 0;
  for (const item of items) {
    const m = item.miles;
    if (typeof m === "number" && Number.isFinite(m) && m > 0) miles += m;
  }
  return { count: items.length, miles };
}

/** The whole derivation the rail needs, in one pass over the list. */
export function selectRailItems(items: RailItem[], query: string, kinds: readonly RailKind[] | null): RailSelection {
  const byQuery = filterByQuery(items, query);
  const visible = filterByKinds(byQuery, kinds);
  return { visible, counts: countByKind(byQuery), totals: totalsFor(visible) };
}

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Right-aligned length for a row, or null when the feature has no length.
 * Under 10 miles keeps a decimal (a 0.4 mi spur is not "0 mi"); above it rounds.
 */
export function formatMiles(miles: number | undefined | null): string | null {
  if (miles == null || typeof miles !== "number" || !Number.isFinite(miles) || miles < 0) return null;
  if (miles === 0) return "0 mi";
  if (miles < 10) {
    const rounded = Math.round(miles * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${text} mi`;
  }
  return `${groupThousands(Math.round(miles))} mi`;
}

/** Header stat line, e.g. "257 features, 563 mi". Point-only lists drop the mileage. */
export function formatStatLine(totals: RailTotals): string {
  const noun = totals.count === 1 ? "feature" : "features";
  const left = `${groupThousands(totals.count)} ${noun}`;
  if (totals.miles <= 0) return left;
  return `${left}, ${formatMiles(totals.miles)}`;
}

export interface RailWindow {
  /** First rendered index, inclusive. */
  start: number;
  /** Last rendered index, exclusive. */
  end: number;
  /** Spacer heights in px that stand in for the rows outside the window. */
  padTop: number;
  padBottom: number;
}

/**
 * Which slice of a long list to actually mount. Pure so the self-check can
 * pin the arithmetic without a DOM.
 *
 * `forceIndex` keeps a specific row mounted even when it is scrolled out. That
 * is what lets arrow-key focus land on a row the window would otherwise have
 * dropped, in the same render pass.
 */
export function sliceWindow(
  total: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number = ROW_HEIGHT,
  overscan: number = OVERSCAN,
  forceIndex: number | null = null,
): RailWindow {
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };

  const top = Math.max(0, scrollTop);
  const height = Math.max(0, viewportHeight);
  // The clamp on `start` matters: a list that shrinks under a filter can leave
  // scrollTop past the new end, which would otherwise mount nothing and pad by
  // more than the list is tall.
  let start = Math.min(Math.max(0, Math.floor(top / rowHeight) - overscan), total - 1);
  let end = Math.min(total, Math.ceil((top + height) / rowHeight) + overscan);
  if (end <= start) end = Math.min(total, start + 1);

  if (forceIndex != null && forceIndex >= 0 && forceIndex < total) {
    start = Math.min(start, forceIndex);
    end = Math.max(end, forceIndex + 1);
  }

  return { start, end, padTop: start * rowHeight, padBottom: (total - end) * rowHeight };
}
