// Simple IndexedDB store for board recordings.
const DB_NAME = "scappio-recordings";
const STORE = "recordings";
const VERSION = 1;

export type RecordingMeta = {
  id: string;
  title: string;
  boardId: string | null;
  durationSec: number;
  createdAt: number;
  mimeType: string;
  thumbnail: string | null; // data URL
  format?: "16:9" | "9:16";
};

export type Recording = RecordingMeta & { blob: Blob };

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const saveRecording = async (rec: Recording): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const listRecordings = async (): Promise<Recording[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out: Recording[] = [];
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    let req: IDBRequest<IDBCursorWithValue | null>;
    try {
      req = store.index("createdAt").openCursor(null, "prev");
    } catch {
      req = store.openCursor();
    }
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { out.push(cur.value as Recording); cur.continue(); }
      else {
        out.sort((a, b) => b.createdAt - a.createdAt);
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
};

export const getRecording = async (id: string): Promise<Recording | null> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Recording) ?? null);
    req.onerror = () => reject(req.error);
  });
};

export const deleteRecording = async (id: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
