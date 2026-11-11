import type { PhotoRecord } from '../types.ts';

/** Armazenamento local no telemóvel: as fotos ficam aqui até serem enviadas. */
export interface PhotoStore {
  add(photo: PhotoRecord): Promise<void>;
  get(id: string): Promise<PhotoRecord | undefined>;
  /** Junta `patch` ao registo de forma atómica. Devolve undefined se o registo não existir. */
  update(id: string, patch: Partial<PhotoRecord>): Promise<PhotoRecord | undefined>;
  remove(id: string): Promise<void>;
  list(): Promise<PhotoRecord[]>;
  listByProcess(processId: string): Promise<PhotoRecord[]>;
  /** Próximo número de ordem para esse processo nesse dia (1, 2, 3...). Nunca repete. */
  nextSequence(processId: string, dayKey: string): Promise<number>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;
}
