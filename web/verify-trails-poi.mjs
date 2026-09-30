// Headless verification of the trails + POI overlays against the built app.
// Isolates the two NEW layers (toggles the default overlays OFF) so the orange
// NFS hiking trails + colored POI markers are unmistakable. Desktop viewport.
import { chromium } from "playwright";

const URL = process.env.VERIFY_URL || "http://127.0.0.1:4173/";
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  geolocation: { longitude: -121.66, latitude: 43.86 },
  permissions: ["geolocation"],
});
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".maplibregl-canvas", { timeout: 15000 });
await page.waitForTimeout(2000);
await page.evaluate(() => window.__map.jumpTo({ center: [-121.66, 43.86], zoom: 13, pitch: 0, bearing: 0 }));
await page.waitForTimeout(1500);

await page.locator(".tool", { hasText: "Layers" }).click();
await page.waitForTimeout(400);
// Turn the loud default overlays OFF so trails/poi stand alone.
for (const label of ["Public land", "Campgrounds", "Camp corridors", "Forest roads (MVUM)", "BLM roads"]) {
  const box = page.locator(".toggle-row", { hasText: label }).locator("input.switch");
  if (await box.isChecked()) await box.uncheck();
}
// Turn the two NEW layers ON.
await page.locator(".toggle-row", { hasText: "Hiking trails" }).locator("input.switch").check();
await page.locator(".toggle-row", { hasText: "Peaks, lakes & trailheads" }).locator("input.switch").check();
await page.waitForTimeout(9000);

await page.evaluate(() => new Promise((r) => window.__map.once("idle", r)));
const stats = await page.evaluate(() => {
  const m = window.__map;
  const src = (id) => m.getSource(id)?._data?.features?.length ?? 0;
  return {
    zoom: +m.getZoom().toFixed(1),
    trailsFeatures: src("src-trails"),
    poiFeatures: src("src-poi"),
    rendered_trails: m.queryRenderedFeatures({ layers: ["l-trails"] }).length,
    rendered_poi: m.queryRenderedFeatures({ layers: ["l-poi"] }).length,
    rendered_trailLabels: m.queryRenderedFeatures({ layers: ["l-trails-label"] }).length,
    rendered_poiLabels: m.queryRenderedFeatures({ layers: ["l-poi-label"] }).length,
  };
});

await page.screenshot({ path: "verify-1-panel.png" });
await page.locator(".panel-head .icon-btn").click().catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: "verify-2-isolated.png" });

await browser.close();
console.log("STATS:", JSON.stringify(stats, null, 2));
console.log("ERRORS:", errors.length ? errors.slice(0, 10) : "none");
