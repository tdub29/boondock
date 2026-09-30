import { useEffect, useRef, useState } from "react";
import { REGIONS, type Region } from "./regions";
import { deleteDownloaded, downloadRegion, listDownloaded, opfsSupported, regionPublished, type Progress } from "./download";

interface Props {
  onClose: () => void;
  onFlyTo: (region: Region) => void;
}

export function OfflinePanel({ onClose, onFlyTo }: Props) {
  const supported = opfsSupported();
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [published, setPublished] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, Progress | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const aborts = useRef<Record<string, AbortController>>({});

  const refresh = () => listDownloaded().then(setDownloaded);

  useEffect(() => {
    void refresh();
    Promise.all(REGIONS.map((r) => regionPublished(r).then((ok) => [r.id, ok] as const))).then((pairs) =>
      setPublished(Object.fromEntries(pairs)),
    );
  }, []);

  const handleDownload = async (r: Region) => {
    setError(null);
    const controller = new AbortController();
    aborts.current[r.id] = controller;
    setProgress((p) => ({ ...p, [r.id]: { received: 0, total: null } }));
    try {
      await downloadRegion(r, (pr) => setProgress((p) => ({ ...p, [r.id]: pr })), controller.signal);
      await refresh();
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setProgress((p) => ({ ...p, [r.id]: undefined }));
      delete aborts.current[r.id];
    }
  };

  const handleDelete = async (r: Region) => {
    await deleteDownloaded(r.id);
    await refresh();
  };

  return (
    <section className="panel" aria-label="Offline maps">
      <header className="panel-head">
        <h3>Offline maps</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="panel-body">
        {!supported && <p className="notice warn">This browser can't store offline maps (no OPFS). Use a recent Chrome/Edge/Safari.</p>}
        <p className="notice">
          Download a region to use the public-land &amp; route overlays with no signal. Topo basemap caches as you browse; satellite stays online-only.
        </p>

        <div className="region-list">
          {REGIONS.map((r) => {
            const pr = progress[r.id];
            const isDownloaded = downloaded.has(r.id);
            const isPublished = published[r.id];
            const pct = pr && pr.total ? Math.round((pr.received / pr.total) * 100) : null;
            return (
              <div className="region" key={r.id}>
                <div className="region-info" onClick={() => onFlyTo(r)} role="button" tabIndex={0}>
                  <div className="region-name">{r.name}</div>
                  <div className="region-meta">
                    {r.states} · ~{r.approxMB} MB
                    {isDownloaded ? " · downloaded ✓" : isPublished === false ? " · not built yet" : ""}
                  </div>
                </div>
                <div className="region-actions">
                  {pr ? (
                    <button className="btn btn-ghost" onClick={() => aborts.current[r.id]?.abort()}>
                      {pct != null ? `${pct}%` : "…"} ✕
                    </button>
                  ) : isDownloaded ? (
                    <button className="btn btn-ghost" onClick={() => handleDelete(r)}>
                      Remove
                    </button>
                  ) : (
                    <button className="btn btn-primary" disabled={!supported || isPublished === false} onClick={() => handleDownload(r)}>
                      Download
                    </button>
                  )}
                </div>
                {pr && (
                  <div className="progress">
                    <div className="progress-bar" style={{ width: pct != null ? `${pct}%` : "40%" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="notice warn">{error}</p>}
        <p className="hint">Regions show “not built yet” until you run the data pipeline (`data/scripts/build_tiles.ps1`).</p>
      </div>
    </section>
  );
}
