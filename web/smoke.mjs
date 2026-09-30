// Headless smoke test: load the app, zoom into Deschutes NF, load live overlays,
// tap the map for a legality verdict, and screenshot. Reports console/page errors.
//
// Requires Playwright (not a runtime dep): `npm i -D playwright && npx playwright install chromium`.
// Run with the dev server up: `npm run dev` then `node smoke.mjs`.
import { chromium } from "playwright";

const URL = process.env.SMOKE_URL || "http://localhost:5173/";
const errors = [];
const logs = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 430, height: 920 },
  deviceScaleFactor: 2,
  geolocation: { longitude: -121.32, latitude: 44.02 },
  permissions: ["geolocation"],
});
const page = await ctx.newPage();
page.on("console", (m) => {
  logs.push(`${m.type()}: ${m.text()}`);
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("response", (r) => {
  if (r.status() >= 400) logs.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`);
});

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".maplibregl-canvas", { timeout: 15000 });
await page.waitForTimeout(2500); // initial style + default-view data

// zoom into Deschutes NF so ownership (z>=8) + MVUM (z>=11) load
await page.evaluate(() => window.__map.jumpTo({ center: [-121.66, 43.86], zoom: 13 }));
await page.waitForTimeout(7000); // let live ArcGIS data + tiles settle

const stats = await page.evaluate(() => {
  const m = window.__map;
  const own = m.getSource("src-ownership")?._data?.features?.length ?? 0;
  const roads = m.getSource("src-mvum-roads")?._data?.features?.length ?? 0;
  return { zoom: +m.getZoom().toFixed(1), ownership: own, mvumRoads: roads };
});

await page.screenshot({ path: "smoke-1-map.png" });

// flatten the camera so projection is accurate for the programmatic road tap
await page.evaluate(() => window.__map.jumpTo({ center: [-121.66, 43.86], zoom: 13, pitch: 0, bearing: 0 }));
await page.waitForTimeout(3000);

// find an actual MVUM road and tap right on it → expect a green/yellow verdict
const target = await page.evaluate(() => {
  const m = window.__map;
  const roads = m.getSource("src-mvum-roads")?._data?.features ?? [];
  const safe = (p) => p.x > 50 && p.x < 380 && p.y > 120 && p.y < 740; // clear of top/bottom UI
  for (const f of roads) {
    const lines =
      f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [];
    for (const line of lines) {
      for (const c of line) {
        const p = m.project(c);
        if (safe(p)) return { x: Math.round(p.x), y: Math.round(p.y) };
      }
    }
  }
  return null;
});
if (target) await page.mouse.click(target.x, target.y);
else await page.mouse.click(215, 460);
await page.waitForTimeout(1500);
const verdictText = await page.locator(".verdict-card h2").first().textContent().catch(() => null);
await page.screenshot({ path: "smoke-2-verdict.png" });

// open the layers panel (should auto-close the verdict)
await page.locator(".tool", { hasText: "Layers" }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: "smoke-3-layers.png" });

// Trips panel (empty state)
await page.locator(".tool", { hasText: "Trips" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "smoke-4-trips.png" });

// Offline panel
await page.locator(".tool", { hasText: "Offline" }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: "smoke-5-offline.png" });

await browser.close();

console.log("STATS:", JSON.stringify(stats));
console.log("VERDICT TITLE:", verdictText);
console.log("ERRORS:", errors.length ? errors.slice(0, 10) : "none");
console.log("HTTP>=400:", logs.filter((l) => l.startsWith("HTTP")).slice(0, 10));
