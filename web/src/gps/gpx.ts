import { newId, type Track } from "./tracks";
import type { Waypoint } from "./waypoints";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Serialize tracks + waypoints to a GPX 1.1 document. */
export function buildGpx(tracks: Track[], waypoints: Waypoint[]): string {
  const wpts = waypoints
    .map(
      (w) =>
        `  <wpt lat="${w.lat}" lon="${w.lng}">\n    <name>${esc(w.name)}</name>${w.note ? `\n    <desc>${esc(w.note)}</desc>` : ""}\n  </wpt>`,
    )
    .join("\n");
  const trks = tracks
    .map((t) => {
      const seg = t.points
        .map((p) => `      <trkpt lat="${p.lat}" lon="${p.lng}">${p.ele != null ? `<ele>${p.ele}</ele>` : ""}<time>${new Date(p.ts).toISOString()}</time></trkpt>`)
        .join("\n");
      return `  <trk>\n    <name>${esc(t.name)}</name>\n    <trkseg>\n${seg}\n    </trkseg>\n  </trk>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Boondock" xmlns="http://www.topografix.com/GPX/1/1">
${wpts}
${trks}
</gpx>`;
}

/** Parse a GPX document into tracks + waypoints. */
export function parseGpx(xml: string): { tracks: Track[]; waypoints: Waypoint[] } {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid GPX file");

  const waypoints: Waypoint[] = Array.from(doc.querySelectorAll("wpt")).map((el, i) => ({
    id: newId(),
    name: el.querySelector("name")?.textContent ?? `Waypoint ${i + 1}`,
    note: el.querySelector("desc")?.textContent ?? undefined,
    lat: Number(el.getAttribute("lat")),
    lng: Number(el.getAttribute("lon")),
    createdAt: Date.now(),
  }));

  const tracks: Track[] = Array.from(doc.querySelectorAll("trk")).map((trk, i) => {
    const points = Array.from(trk.querySelectorAll("trkpt")).map((pt) => ({
      lat: Number(pt.getAttribute("lat")),
      lng: Number(pt.getAttribute("lon")),
      ele: pt.querySelector("ele") ? Number(pt.querySelector("ele")!.textContent) : null,
      ts: pt.querySelector("time") ? Date.parse(pt.querySelector("time")!.textContent ?? "") : Date.now(),
    }));
    return { id: newId(), name: trk.querySelector("name")?.textContent ?? `Track ${i + 1}`, createdAt: Date.now(), points };
  });

  return { tracks, waypoints };
}

/** Trigger a browser download of a text file. */
export function downloadText(filename: string, text: string, mime = "application/gpx+xml") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
