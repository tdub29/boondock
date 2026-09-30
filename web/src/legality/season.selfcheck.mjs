// Runnable check for the MVUM dates-open parser and the BLM seasonal flag in season.ts. No DOM.
//
//   node web/src/legality/season.selfcheck.mjs
//
// Node 23.6+ strips TypeScript types natively, so the .ts module imports
// directly. On Node 22.6 to 23.5 add --experimental-strip-types.
// Every expected value below is written by hand; nothing here re-implements
// the parser it is checking. Input strings mirror real shapes from the MVUM
// roads layer.

import assert from "node:assert/strict";

import { bestSeason, blmSeason, parseWindows, seasonOn } from "./season.ts";

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
}

// Local-time calendar day; the year is irrelevant to a recurring window.
const on = (month, day) => new Date(2026, month - 1, day, 12);

console.log("season");

check("single window, boundaries inclusive", () => {
  const raw = "05/15-10/31";
  assert.deepEqual(parseWindows(raw), [{ from: 515, to: 1031 }]);
  assert.equal(seasonOn(raw, on(5, 14)), "closed");
  assert.equal(seasonOn(raw, on(5, 15)), "open");
  assert.equal(seasonOn(raw, on(7, 4)), "open");
  assert.equal(seasonOn(raw, on(10, 31)), "open");
  assert.equal(seasonOn(raw, on(11, 1)), "closed");
  assert.equal(seasonOn("01/01-12/31", on(1, 1)), "open");
  assert.equal(seasonOn("01/01-12/31", on(12, 31)), "open");
});

check("two, three and four comma separated windows", () => {
  const two = "06/01-09/15,11/01-12/31";
  assert.deepEqual(parseWindows(two), [
    { from: 601, to: 915 },
    { from: 1101, to: 1231 },
  ]);
  assert.equal(seasonOn(two, on(7, 1)), "open");
  assert.equal(seasonOn(two, on(10, 1)), "closed");
  assert.equal(seasonOn(two, on(12, 15)), "open");
  assert.equal(seasonOn(two, on(1, 15)), "closed");

  const three = "01/01-03/31, 06/15-08/31, 11/15-12/31";
  assert.equal(parseWindows(three).length, 3);
  assert.equal(seasonOn(three, on(2, 1)), "open");
  assert.equal(seasonOn(three, on(5, 1)), "closed");
  assert.equal(seasonOn(three, on(8, 31)), "open");
  assert.equal(seasonOn(three, on(11, 14)), "closed");

  const four = "01/01-02/15,04/01-05/15,07/01-08/15,10/01-11/15";
  assert.equal(parseWindows(four).length, 4);
  assert.equal(seasonOn(four, on(3, 1)), "closed");
  assert.equal(seasonOn(four, on(10, 1)), "open");
  assert.equal(seasonOn(four, on(12, 1)), "closed");
});

check("windows separated by runs of spaces instead of commas", () => {
  const raw = "06/01-09/15   11/01-12/31";
  assert.deepEqual(parseWindows(raw), [
    { from: 601, to: 915 },
    { from: 1101, to: 1231 },
  ]);
  assert.equal(seasonOn(raw, on(8, 1)), "open");
  assert.equal(seasonOn(raw, on(10, 15)), "closed");
  assert.equal(seasonOn("04/01-06/30  08/01-10/31", on(7, 15)), "closed");
});

check("single-digit month or day", () => {
  assert.deepEqual(parseWindows("05/15-9/30"), [{ from: 515, to: 930 }]);
  assert.deepEqual(parseWindows("5/1-10/31"), [{ from: 501, to: 1031 }]);
  assert.equal(seasonOn("05/15-9/30", on(9, 30)), "open");
  assert.equal(seasonOn("05/15-9/30", on(10, 1)), "closed");
  assert.equal(seasonOn("5/1-10/31", on(4, 30)), "closed");
  assert.equal(seasonOn("5/1-10/31", on(5, 1)), "open");
});

check("spaces around the dash", () => {
  assert.deepEqual(parseWindows("04/01 - 6/30"), [{ from: 401, to: 630 }]);
  assert.equal(seasonOn("04/01 - 6/30", on(6, 30)), "open");
  assert.equal(seasonOn("04/01 - 6/30", on(7, 1)), "closed");
});

check("a window that wraps the new year is open across the boundary", () => {
  const raw = "12/01-03/31";
  assert.deepEqual(parseWindows(raw), [{ from: 1201, to: 331 }]);
  // inside
  assert.equal(seasonOn(raw, on(12, 1)), "open");
  assert.equal(seasonOn(raw, on(12, 31)), "open");
  assert.equal(seasonOn(raw, on(1, 1)), "open");
  assert.equal(seasonOn(raw, on(2, 14)), "open");
  assert.equal(seasonOn(raw, on(3, 31)), "open");
  // outside
  assert.equal(seasonOn(raw, on(4, 1)), "closed");
  assert.equal(seasonOn(raw, on(7, 4)), "closed");
  assert.equal(seasonOn(raw, on(11, 30)), "closed");
  // wrapping window mixed with a normal one, and with spaces around the dash
  assert.equal(seasonOn("12/15 - 1/15,06/01-09/30", on(1, 10)), "open");
  assert.equal(seasonOn("12/15 - 1/15,06/01-09/30", on(3, 1)), "closed");
});

check("the junk values seen in the data are unknown, never open", () => {
  for (const raw of ["open", "None", " ", "", null, undefined, 0, {}]) {
    assert.equal(parseWindows(raw), null, `parseWindows(${JSON.stringify(raw)})`);
    assert.equal(seasonOn(raw, on(7, 1)), "unknown", `seasonOn(${JSON.stringify(raw)})`);
  }
  // The `seasonal` field's words are not dates either, if one ever lands here.
  for (const raw of ["Seasonal", "seasonal", "seasonal ", "yearlong"]) {
    assert.equal(seasonOn(raw, on(7, 1)), "unknown", raw);
  }
});

check("leftover text or impossible dates poison the whole value", () => {
  for (const raw of [
    "05/15-10/31 except fire closures",
    "05/15-10/31;06/01-06/30",
    "05/15-10/31 -",
    "open 05/15-10/31",
    "2026/05/15-10/31",
    "05/15-10/315",
    "05/15",
    "05-10",
    "13/01-12/31",
    "00/10-05/01",
    "05/00-10/31",
    "02/30-10/31",
    "04/31-10/31",
    "05/15-10/31,13/01-13/31",
  ]) {
    assert.equal(parseWindows(raw), null, raw);
    assert.equal(seasonOn(raw, on(7, 1)), "unknown", raw);
  }
  // Feb 29 is a real calendar boundary.
  assert.deepEqual(parseWindows("02/29-10/31"), [{ from: 229, to: 1031 }]);
});

check("bestSeason: any open class wins, an unreadable one means verify", () => {
  assert.equal(bestSeason(["open", "closed"]), "open");
  assert.equal(bestSeason(["closed", "open"]), "open");
  assert.equal(bestSeason(["unknown", "open"]), "open");
  assert.equal(bestSeason(["closed", "unknown"]), "unknown");
  assert.equal(bestSeason([null, "unknown"]), "unknown");
  assert.equal(bestSeason(["closed", "closed"]), "closed");
  assert.equal(bestSeason(["closed", null]), "closed");
  assert.equal(bestSeason([null, null]), null);
  assert.equal(bestSeason([]), null);
});

check("blmSeason: a BLM seasonal flag is unknown, never open or closed", () => {
  // The flag values seen across the GTLF layer, in the casing they are stored in.
  for (const code of ["YES", "Yes", " yes "]) {
    assert.equal(blmSeason({ PLAN_SEASON_RSTRCT_CODE: code }), "unknown", code);
  }
  for (const code of ["NO", "No", "UNK", "N/A", "", null, undefined]) {
    assert.equal(blmSeason({ PLAN_SEASON_RSTRCT_CODE: code }), null, String(code));
  }
  assert.equal(blmSeason({}), null);
  // The limitation field names a season on routes whose flag says NO or is empty.
  for (const lim of ["Limited by Season", "LIMITED BY SEASON", "Limited by Type of Vehicle and Season"]) {
    assert.equal(blmSeason({ PLAN_SEASON_RSTRCT_CODE: "NO", OHV_ROUTE_DSGNTN_LIM: lim }), "unknown", lim);
    assert.equal(blmSeason({ OHV_ROUTE_DSGNTN_LIM: lim }), "unknown", lim);
  }
  for (const lim of ["Limited by Other", "LIMITED BY TYPE OF VEHICLE", null]) {
    assert.equal(blmSeason({ PLAN_SEASON_RSTRCT_CODE: "NO", OHV_ROUTE_DSGNTN_LIM: lim }), null, String(lim));
  }
  // Free-text dates in the explanation never turn a flagged route open, even
  // when today falls inside the range the text names.
  const flagged = { PLAN_SEASON_RSTRCT_CODE: "YES", OHV_DSGNTN_LIM_EXPLAIN: "Open May 1 to December 15" };
  assert.equal(blmSeason(flagged), "unknown");
  // What the verdict does with it: BLM routes are open to passenger vehicles,
  // so this is the only class, and the corridor is not green.
  assert.equal(bestSeason([blmSeason(flagged), null]), "unknown");
  assert.equal(bestSeason([blmSeason({ PLAN_SEASON_RSTRCT_CODE: "NO" }) ?? "open", null]), "open");
});

console.log(`\n${checks} checks passed`);
