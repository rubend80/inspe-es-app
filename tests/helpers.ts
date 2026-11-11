import type { PhotoStore } from '../src/storage/PhotoStore.ts';
import type { StorageProvider, UploadRequest, UploadResult } from '../src/storage/StorageProvider.ts';
import type { PhotoRecord, Process } from '../src/types.ts';

/** Versão em memória do PhotoStore, para testar sem browser. */
export class MemoryPhotoStore implements PhotoStore {
  readonly photos = new Map<string, PhotoRecord>();
  readonly meta = new Map<string, unknown>();

  async add(photo: PhotoRecord): Promise<void> {
    this.photos.set(photo.id, { ...photo });
  }
  async get(id: string): Promise<PhotoRecord | undefined> {
    const p = this.photos.get(id);
    return p ? { ...p } : undefined;
  }
  async update(id: string, patch: Partial<PhotoRecord>): Promise<PhotoRecord | undefined> {
    const p = this.photos.get(id);
    if (!p) return undefined;
    const next = { ...p, ...patch };
    this.photos.set(id, next);
    return { ...next };
  }
  async remove(id: string): Promise<void> {
    this.photos.delete(id);
  }
  async list(): Promise<PhotoRecord[]> {
    return [...this.photos.values()].map((p) => ({ ...p }));
  }
  async listByProcess(processId: string): Promise<PhotoRecord[]> {
    return (await this.list()).filter((p) => p.processId === processId);
  }
  async nextSequence(processId: string, dayKey: string): Promise<number> {
    const key = `seq:${processId}:${dayKey}`;
    const next = ((this.meta.get(key) as number | undefined) ?? 0) + 1;
    this.meta.set(key, next);
    return next;
  }
  async getMeta<T>(key: string): Promise<T | undefined> {
    return this.meta.get(key) as T | undefined;
  }
  async setMeta<T>(key: string, value: T): Promise<void> {
    this.meta.set(key, value);
  }
}

/** Provider falso: regista o que recebe e falha quando se lhe pede. */
export class FakeProvider implements StorageProvider {
  readonly name = 'fake';
  /** Mude para false para simular uma pasta no telemóvel (não espera por rede). */
  needsNetwork = true;
  readonly uploaded: UploadRequest[] = [];
  /** Erros a lançar, um por envio, por ordem. */
  readonly failures: Error[] = [];
  /** Falha seletiva (ex.: só a versão leve). Corre depois de `failures`. */
  failWhen?: (req: UploadRequest) => Error | undefined;

  async listProcesses(): Promise<Process[]> {
    return [];
  }
  async uploadPhoto(req: UploadRequest): Promise<UploadResult> {
    const failure = this.failures.shift() ?? this.failWhen?.(req);
    if (failure) throw failure;
    this.uploaded.push(req);
    return { remotePath: `${req.folder}/${req.fileName}` };
  }
}

export function makePhoto(id: string, takenAt: number, patch: Partial<PhotoRecord> = {}): PhotoRecord {
  return {
    id,
    processId: '2026-0142',
    processName: 'Rua das Flores 12',
    processFolder: '2026-0142',
    divisionId: 'cozinha',
    divisionName: 'Cozinha',
    divisionFolder: 'Cozinha',
    fileName: `${id}.jpg`,
    takenAt,
    mimeType: 'image/jpeg',
    size: 3,
    status: 'pending',
    attempts: 0,
    blob: new Blob(['abc'], { type: 'image/jpeg' }),
    ...patch,
  };
}
