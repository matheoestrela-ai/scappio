// Tiny IndexedDB wrapper for storing recorded videos client-side.

export type Recording = {
  id: string;
  name: string;
  createdAt: number;
  duration: number; // seconds
  mimeType: string;
  size: number;
  blob: Blob;
};

export type RecordingMeta = Omit<Recording, "blob">;

const DB_NAME = "gribouille-recordings";
const STORE = "recordings";
const VERSION = 1;

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const saveRecording = async (rec: Recording): Promise<void> => {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

export const listRecordings = async (): Promise<Recording[]> => {
  const db = await openDB();
  const recs = await new Promise<Recording[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as Recording[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return recs.sort((a, b) => b.createdAt - a.createdAt);
};

export const getRecording = async (id: string): Promise<Recording | null> => {
  const db = await openDB();
  const rec = await new Promise<Recording | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Recording) || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rec;
};

export const deleteRecording = async (id: string): Promise<void> => {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};
