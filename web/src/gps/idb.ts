// Tiny promise wrapper over IndexedDB for tracks & waypoints (works offline).

const DB_NAME = "boondock";
const DB_VERSION = 2;
export type StoreName = "tracks" | "waypoints" | "views";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("tracks")) db.createObjectStore("tracks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("waypoints")) db.createObjectStore("waypoints", { keyPath: "id" });
      if (!db.objectStoreNames.contains("views")) db.createObjectStore("views", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbGetAll = <T>(store: StoreName): Promise<T[]> => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
export const idbPut = <T>(store: StoreName, value: T): Promise<IDBValidKey> =>
  tx<IDBValidKey>(store, "readwrite", (s) => s.put(value as unknown as Record<string, unknown>) as IDBRequest<IDBValidKey>);
export const idbDelete = (store: StoreName, id: string): Promise<undefined> =>
  tx<undefined>(store, "readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
