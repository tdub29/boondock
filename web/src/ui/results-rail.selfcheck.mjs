// Runnable check for the pure logic behind <ResultsRail>. No React, no DOM.
//
//   node web/src/ui/results-rail.selfcheck.mjs
//
// Node 23.6+ strips TypeScript types natively, so the .ts helpers import
// directly. On Node 22.6 to 23.5 add --experimental-strip-types.
// Every expected value below is written by hand; nothing here re-implements
// the helpers it is checking.

import assert from "node:assert/strict";

import {
  KIND_META,
  OVERSCAN,
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

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`  ok  ${name}`);
}

const items = [
  { id: "r1", kind: "mvumRoads", name: "NF-25 Lewis River Road", subLabel: "Open to all vehicles", miles: 12.4 },
  { id: "r2", kind: "mvumRoads", name: "NF-2515 Spur", subLabel: "High clearance", miles: 0.42 },
  { id: "r3", kind: "blmRoads", name: "Juniper Flat Road", subLabel: "BLM", miles: 7 },
  { id: "t1", kind: "mvumTrails", name: "Elk Pass OHV Trail", subLabel: "Trail 176", miles: 4 },
  { id: "t2", kind: "trails", name: "Boundary Trail", subLabel: "Trail 1", miles: 30.6 },
  { id: "c1", kind: "campgrounds", name: "Lower Falls Campground", subLabel: "USFS" },
  { id: "p1", kind: "poi", name: "Mount Adams", subLabel: "Peak" },
  { id: "p2", kind: "poi", name: "Takhlakh Lake", subLabel: "Lake" },
];

console.log("results-rail.logic");

check("tokenize splits and lowercases, dropping blanks", () => {
  assert.deepEqual(tokenize("  Lewis   RIVER "), ["lewis", "river"]);
  assert.deepEqual(tokenize("   "), []);
});

check("matchesQuery is an AND over name plus subLabel", () => {
  const road = items[0];
  assert.equal(matchesQuery(road, []), true);
  assert.equal(matchesQuery(road, ["lewis", "vehicles"]), true);
  assert.equal(matchesQuery(road, ["lewis", "kayak"]), false);
  assert.equal(matchesQuery(items[5], ["usfs"]), true);
  assert.equal(matchesQuery(items[6], ["peak"]), true);
});

check("filterByQuery returns the same array when the query is blank", () => {
  assert.equal(filterByQuery(items, "   "), items);
  assert.deepEqual(
    filterByQuery(items, "trail").map((i) => i.id),
    ["t1", "t2"],
  );
  assert.deepEqual(
    filterByQuery(items, "nf-25").map((i) => i.id),
    ["r1", "r2"],
  );
  assert.deepEqual(filterByQuery(items, "zzz"), []);
});

check("filterByKinds treats no chips as all chips", () => {
  assert.equal(filterByKinds(items, []), items);
  assert.equal(filterByKinds(items, null), items);
  assert.deepEqual(
    filterByKinds(items, ["poi"]).map((i) => i.id),
    ["p1", "p2"],
  );
  assert.deepEqual(
    filterByKinds(items, ["mvumRoads", "blmRoads"]).map((i) => i.id),
    ["r1", "r2", "r3"],
  );
});

check("countByKind reports every kind, including the empty ones", () => {
  assert.deepEqual(countByKind(items), {
    mvumRoads: 2,
    blmRoads: 1,
    mvumTrails: 1,
    trails: 1,
    campgrounds: 1,
    poi: 2,
  });
  assert.deepEqual(countByKind([]), {
    mvumRoads: 0,
    blmRoads: 0,
    mvumTrails: 0,
    trails: 0,
    campgrounds: 0,
    poi: 0,
  });
});

check("totalsFor counts rows and sums only real mileage", () => {
  const t = totalsFor(items);
  assert.equal(t.count, 8);
  // 12.4 + 0.42 + 7 + 4 + 30.6, written out rather than recomputed.
  assert.equal(Math.round(t.miles * 100) / 100, 54.42);

  assert.deepEqual(totalsFor([]), { count: 0, miles: 0 });
  assert.deepEqual(totalsFor([{ id: "x", kind: "poi", name: "Point" }]), { count: 1, miles: 0 });
  assert.deepEqual(
    totalsFor([
      { id: "a", kind: "trails", name: "Bad", miles: Number.NaN },
      { id: "b", kind: "trails", name: "Worse", miles: -3 },
      { id: "c", kind: "trails", name: "Good", miles: 2 },
    ]),
    { count: 3, miles: 2 },
  );
});

check("selectRailItems counts before the chips and totals after them", () => {
  const all = selectRailItems(items, "", []);
  assert.equal(all.visible.length, 8);
  assert.equal(all.counts.poi, 2);

  const chipped = selectRailItems(items, "", ["poi"]);
  assert.deepEqual(
    chipped.visible.map((i) => i.id),
    ["p1", "p2"],
  );
  // Counts still describe the unchipped set, so a dark chip shows what it would add.
  assert.equal(chipped.counts.mvumRoads, 2);
  assert.deepEqual(chipped.totals, { count: 2, miles: 0 });

  const both = selectRailItems(items, "trail", ["trails"]);
  assert.deepEqual(
    both.visible.map((i) => i.id),
    ["t2"],
  );
  // The text filter narrowed the chip counts, the chip selection did not.
  assert.equal(both.counts.mvumTrails, 1);
  assert.equal(both.counts.poi, 0);
  assert.deepEqual(both.totals, { count: 1, miles: 30.6 });
});

check("formatMiles keeps a decimal under ten and groups thousands above it", () => {
  assert.equal(formatMiles(undefined), null);
  assert.equal(formatMiles(null), null);
  assert.equal(formatMiles(Number.NaN), null);
  assert.equal(formatMiles(-1), null);
  assert.equal(formatMiles(0), "0 mi");
  assert.equal(formatMiles(0.42), "0.4 mi");
  assert.equal(formatMiles(4), "4 mi");
  assert.equal(formatMiles(9.96), "10 mi");
  assert.equal(formatMiles(12.4), "12 mi");
  assert.equal(formatMiles(563.2), "563 mi");
  assert.equal(formatMiles(1204), "1,204 mi");
});

check("formatStatLine reads like the header of a rail", () => {
  assert.equal(formatStatLine({ count: 257, miles: 563 }), "257 features, 563 mi");
  assert.equal(formatStatLine({ count: 1, miles: 4.2 }), "1 feature, 4.2 mi");
  assert.equal(formatStatLine({ count: 0, miles: 0 }), "0 features");
  assert.equal(formatStatLine({ count: 3, miles: 0 }), "3 features");
  assert.equal(formatStatLine({ count: 2140, miles: 11890 }), "2,140 features, 11,890 mi");
  assert.equal(formatStatLine(totalsFor(items)), "8 features, 54 mi");
});

check("sliceWindow mounts the viewport plus overscan, and pads the rest", () => {
  assert.deepEqual(sliceWindow(0, 0, 400), { start: 0, end: 0, padTop: 0, padBottom: 0 });

  // 10 rows of 10px, a 30px viewport, no overscan: rows 0 through 2 plus the
  // boundary row, then 70px of spacer below.
  assert.deepEqual(sliceWindow(10, 0, 30, 10, 0), { start: 0, end: 3, padTop: 0, padBottom: 70 });
  assert.deepEqual(sliceWindow(10, 25, 30, 10, 0), { start: 2, end: 6, padTop: 20, padBottom: 40 });
  assert.deepEqual(sliceWindow(10, 25, 30, 10, 2), { start: 0, end: 8, padTop: 0, padBottom: 20 });

  // Never runs off either end.
  assert.deepEqual(sliceWindow(10, -500, 30, 10, 0), { start: 0, end: 3, padTop: 0, padBottom: 70 });
  assert.deepEqual(sliceWindow(10, 9999, 30, 10, 0), { start: 9, end: 10, padTop: 90, padBottom: 0 });

  // A zero-height list still mounts one row, so arrow keys have something to land on.
  assert.deepEqual(sliceWindow(10, 0, 0, 10, 0), { start: 0, end: 1, padTop: 0, padBottom: 90 });

  // forceIndex drags the window out to include a row the scroll position dropped.
  assert.deepEqual(sliceWindow(10, 0, 30, 10, 0, 7), { start: 0, end: 8, padTop: 0, padBottom: 20 });
  assert.deepEqual(sliceWindow(10, 80, 30, 10, 0, 1), { start: 1, end: 10, padTop: 10, padBottom: 0 });
  // Out of range is ignored rather than throwing.
  assert.deepEqual(sliceWindow(10, 0, 30, 10, 0, 99), { start: 0, end: 3, padTop: 0, padBottom: 70 });

  // Padding always accounts for every unmounted row.
  const w = sliceWindow(500, 4600, 460, ROW_HEIGHT, OVERSCAN);
  assert.equal(w.padTop, w.start * ROW_HEIGHT);
  assert.equal(w.padBottom, (500 - w.end) * ROW_HEIGHT);
  assert.ok(w.end - w.start < 40, "window stays small for a 500 row list");
});

check("railSwatchColor matches what map/layers.ts paints", () => {
  assert.equal(railSwatchColor("mvumRoads", "open"), "#4AA3F0");
  assert.equal(railSwatchColor("mvumRoads", "restricted"), "#2D6BB8");
  assert.equal(railSwatchColor("mvumRoads", null), "#4AA3F0");
  assert.equal(railSwatchColor("campgrounds", "BLM"), "#e0a93b");
  assert.equal(railSwatchColor("campgrounds", "WA State Parks"), "#94d37b");
  assert.equal(railSwatchColor("campgrounds", "Unknown agency"), "#f1d59a");
  assert.equal(railSwatchColor("poi", "lake"), "#5aa9e0");
  assert.equal(railSwatchColor("poi", "trailhead"), "#5fbf74");
  assert.equal(railSwatchColor("trails", "anything"), "#EC7A3D");
  assert.equal(railSwatchColor("mvumTrails", "anything"), "#B57BD0");
  assert.equal(railSwatchColor("blmRoads", "anything"), "#4AA3F0");
});

check("the kind list and its metadata stay in step", () => {
  assert.deepEqual(RAIL_KINDS, ["mvumRoads", "blmRoads", "mvumTrails", "trails", "campgrounds", "poi"]);
  for (const kind of RAIL_KINDS) {
    const meta = KIND_META[kind];
    assert.ok(meta, `${kind} has metadata`);
    assert.match(meta.color, /^#[0-9a-fA-F]{6}$/, `${kind} has a hex color`);
    assert.ok(meta.shape === "line" || meta.shape === "dot", `${kind} has a swatch shape`);
    assert.ok(meta.short.length > 0 && meta.label.length > 0, `${kind} is labelled`);
  }
  assert.equal(Object.keys(KIND_META).length, RAIL_KINDS.length);
  assert.equal(ROW_HEIGHT, 46);
  assert.equal(VIRTUALIZE_ABOVE, 60);
});

console.log(`\n${checks} checks passed`);
