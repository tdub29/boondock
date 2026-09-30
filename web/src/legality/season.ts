// MVUM "dates open" parsing. The service stores each vehicle class's season as
// a bare recurring day range with no year, e.g. "05/15-10/31". Profiled across
// the whole roads layer (passengervehicle_datesopen, 729 distinct values;
// highclearancevehicle_datesopen has the same shape mix):
//   652  "MM/DD-MM/DD"
//    38  two windows, comma separated ("06/01-09/15,11/01-12/31")
//    27  three windows, comma separated
//     1  four windows
//     5  windows separated by runs of spaces instead of commas
//     2  a single-digit part ("MM/DD-M/DD")
//     1  spaces around the dash ("MM/DD - M/DD")
//     3  junk: "open", "None", " "
// Nulls occur on real rows too. There is no coded-value domain on the field,
// so the shapes above are the only contract there is.
//
// Failing direction: this feeds the camping verdict, and a route is only a
// valid camping corridor while it is OPEN. Anything that is not a clean set of
// real calendar windows comes back "unknown", never "open". The literal string
// "open" is unknown too: it names no season, so it cannot say what today is.

export type SeasonStatus = "open" | "closed" | "unknown";

export interface OpenWindow {
  from: number; // month * 100 + day
  to: number;
}

const WINDOW = /(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/g;
// Feb allows 29 so a leap-day boundary is still a real date.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function key(month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;
  return month * 100 + day;
}

/** All windows in the string, or null if any part of it is not a window. */
export function parseWindows(raw: unknown): OpenWindow[] | null {
  if (typeof raw !== "string") return null;
  const windows: OpenWindow[] = [];
  for (const m of raw.matchAll(WINDOW)) {
    const from = key(Number(m[1]), Number(m[2]));
    const to = key(Number(m[3]), Number(m[4]));
    if (from === null || to === null) return null;
    windows.push({ from, to });
  }
  if (!windows.length) return null;
  // Anything left after the windows and their separators is text we did not
  // understand, so do not trust the windows either.
  if (raw.replace(WINDOW, "").replace(/[\s,]/g, "") !== "") return null;
  return windows;
}

/** Is the route open on this date (device local time), per its dates-open string? */
export function seasonOn(raw: unknown, date: Date): SeasonStatus {
  const windows = parseWindows(raw);
  if (!windows) return "unknown";
  const today = (date.getMonth() + 1) * 100 + date.getDate();
  const inside = windows.some((w) =>
    // A window whose end is before its start wraps the new year: 12/01-03/31.
    w.from <= w.to ? today >= w.from && today <= w.to : today >= w.from || today <= w.to,
  );
  return inside ? "open" : "closed";
}

// BLM GTLF seasonal restriction. Profiled across all 110,413 routes (2026-09-24):
// PLAN_SEASON_RSTRCT_CODE is a YES/NO/UNK coded flag, stored in mixed case:
//   92,707 "NO"   6,531 "No"   8,947 null   2,047 "YES"   10 "Yes"   157 "N/A"   14 "UNK"
// OHV_ROUTE_DSGNTN_LIM says "Limited by Season" (or "... and Season", any case)
// on 34 more routes whose flag is not YES. No field holds structured dates.
// The only dates are free text in OHV_DSGNTN_LIM_EXPLAIN ("Open May 1 to
// December 15", "Closed 12/1- 4/15", "December 1 - May 15"), and many do not
// say whether the range is open or closed, so they are shown, never parsed.
// A restricted route is therefore "unknown", never "open" and never "closed".

/** "unknown" when the BLM marks the route seasonally restricted, else null (no seasonal question). */
export function blmSeason(props: Record<string, unknown>): SeasonStatus | null {
  const flag = String(props.PLAN_SEASON_RSTRCT_CODE ?? "").trim().toUpperCase();
  const limit = String(props.OHV_ROUTE_DSGNTN_LIM ?? "").toUpperCase();
  return flag === "YES" || limit.includes("SEASON") ? "unknown" : null;
}

/**
 * One status for a route across its vehicle classes. Pass null for a class the
 * route is not designated open to. Any class in season makes the route usable;
 * otherwise one unreadable class means "unknown" (it might be open), and only
 * when every designated class is out of season is it "closed". null when no
 * class is designated open at all, which is not a seasonal question.
 */
export function bestSeason(classes: (SeasonStatus | null)[]): SeasonStatus | null {
  if (classes.includes("open")) return "open";
  if (classes.includes("unknown")) return "unknown";
  if (classes.includes("closed")) return "closed";
  return null;
}
