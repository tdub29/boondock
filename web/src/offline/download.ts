import type { Region } from "./regions";

// Offline storage uses OPFS (Origin Private File System): one .pmtiles file per
// downloaded region. MapLibre reads it back via the pmtiles FileSource.

const fileName = (id: string) => `${id}.pmtiles`;

export function opfsSupported(): boolean {
  return typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage;
}

async function root(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

export async function listDownloaded(): Promise<Set<string>> {
  if (!opfsSupported()) return new Set();
  const dir = await root();
  const ids = new Set<string>();
  // @ts-expect-error - entries() exists on OPFS dir handles but isn't in older TS DOM libs
  for await (const [name] of dir.entries()) {
    if (typeof name === "string" && name.endsWith(".pmtiles")) ids.add(name.replace(/\.pmtiles$/, ""));
  }
  return ids;
}

export interface Progress {
  received: number;
  total: number | null;
}

/** Stream a region's PMTiles into OPFS, reporting progress. */
export async function downloadRegion(region: Region, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<void> {
  if (!opfsSupported()) throw new Error("Offline storage isn't available in this browser.");
  const res = await fetch(region.pmtilesUrl, { signal });
  if (!res.ok || !res.body) throw new Error(`Region not built yet (HTTP ${res.status}). Run the data pipeline first.`);

  const total = Number(res.headers.get("content-length")) || null;
  const dir = await root();
  const handle = await dir.getFileHandle(fileName(region.id), { create: true });
  const writable = await handle.createWritable();

  const reader = res.body.getReader();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      received += value.byteLength;
      onProgress({ received, total });
    }
    await writable.close();
  } catch (err) {
    await writable.abort?.();
    await dir.removeEntry(fileName(region.id)).catch(() => {});
    throw err;
  }
}

export async function deleteDownloaded(id: string): Promise<void> {
  if (!opfsSupported()) return;
  const dir = await root();
  await dir.removeEntry(fileName(id)).catch(() => {});
}

/** The downloaded File (for MapLibre's pmtiles FileSource), or null. */
export async function getOfflineFile(id: string): Promise<File | null> {
  if (!opfsSupported()) return null;
  try {
    const dir = await root();
    const handle = await dir.getFileHandle(fileName(id));
    return await handle.getFile();
  } catch {
    return null;
  }
}

/** Is the region's PMTiles actually published (pipeline run)? */
export async function regionPublished(region: Region): Promise<boolean> {
  try {
    const res = await fetch(region.pmtilesUrl, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}
