import type { PhotoRecord } from '../types.ts';
import type { PhotoStore } from './PhotoStore.ts';

const DB_NAME = 'inspecoes';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('byProcess', 'processId');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      // Só usado pela versão de demonstração (simula a biblioteca no SharePoint).
      if (!db.objectStoreNames.contains('remote')) {
        db.createObjectStore('remote', { keyPath: 'path' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Não foi possível abrir a base de dados local.'));
    req.onblocked = () => reject(new Error('A base de dados local está bloqueada por outro separador.'));
  });
  dbPromise = p;
  p.catch(() => {
    dbPromise = null;
  });
  return p;
}

export function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Erro na base de dados local.'));
  });
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Erro na base de dados local.'));
    tx.onabort = () => reject(tx.error ?? new Error('Operação cancelada na base de dados local.'));
  });
}

export class IdbPhotoStore implements PhotoStore {
  async add(photo: PhotoRecord): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(photo);
    await transactionDone(tx);
  }

  async get(id: string): Promise<PhotoRecord | undefined> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readonly');
    return (await requestToPromise(tx.objectStore('photos').get(id))) as PhotoRecord | undefined;
  }

  async update(id: string, patch: Partial<PhotoRecord>): Promise<PhotoRecord | undefined> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readwrite');
    const store = tx.objectStore('photos');
    const current = (await requestToPromise(store.get(id))) as PhotoRecord | undefined;
    if (!current) {
      await transactionDone(tx);
      return undefined;
    }
    const next: PhotoRecord = { ...current, ...patch };
    store.put(next);
    await transactionDone(tx);
    return next;
  }

  async remove(id: string): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').delete(id);
    await transactionDone(tx);
  }

  async list(): Promise<PhotoRecord[]> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readonly');
    return (await requestToPromise(tx.objectStore('photos').getAll())) as PhotoRecord[];
  }

  async listByProcess(processId: string): Promise<PhotoRecord[]> {
    const db = await openDb();
    const tx = db.transaction('photos', 'readonly');
    const index = tx.objectStore('photos').index('byProcess');
    return (await requestToPromise(index.getAll(processId))) as PhotoRecord[];
  }

  async nextSequence(processId: string, dayKey: string): Promise<number> {
    const db = await openDb();
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    const key = `seq:${processId}:${dayKey}`;
    const row = (await requestToPromise(store.get(key))) as { key: string; value: number } | undefined;
    const next = (row?.value ?? 0) + 1;
    store.put({ key, value: next });
    await transactionDone(tx);
    return next;
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await openDb();
    const tx = db.transaction('meta', 'readonly');
    const row = (await requestToPromise(tx.objectStore('meta').get(key))) as { key: string; value: T } | undefined;
    return row?.value;
  }

  async setMeta<T>(key: string, value: T): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    await transactionDone(tx);
  }
}
