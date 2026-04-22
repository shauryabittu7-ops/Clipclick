"use client";

/**
 * Persistent media file store — keeps uploaded files alive across page reloads.
 *
 * Yjs / IndexedDB stores asset metadata (name, duration, width, height) but
 * blob URLs are session-scoped and die on reload. This module stores the raw
 * file bytes in a separate IDBObjectStore keyed by assetId, so we can recreate
 * a fresh blob URL on every page load without the user re-uploading.
 */

const DB_NAME = "clipclick-media-v1";
const STORE_NAME = "files";
const DB_VERSION = 1;

interface StoredFile {
  blob: Blob;
  name: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist a media file by asset ID. Call this right after addAsset(). */
export async function saveMediaFile(
  assetId: string,
  file: File | Blob,
  name: string
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ blob: file, name } satisfies StoredFile, assetId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Retrieve a previously stored file. Returns null if not found. */
export async function loadMediaFile(assetId: string): Promise<StoredFile | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(assetId);
    req.onsuccess = () => { db.close(); resolve((req.result as StoredFile) ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** Delete a stored file (call when the asset is removed from the timeline). */
export async function deleteMediaFile(assetId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(assetId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Wipe everything (useful for a "clear project" action). */
export async function clearAllMedia(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
