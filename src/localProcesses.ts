import type { PhotoStore } from './storage/PhotoStore.ts';
import type { Process } from './types.ts';

/**
 * Sem ligação ao OneDrive, os processos são criados no próprio telemóvel, só com o número.
 * A pasta do processo tem o nome do número (ex.: "260098").
 */
export interface NewProcessInput {
  id: string;
}

export type AddProcessResult = { ok: true; process: Process } | { ok: false; error: string };

export function buildLocalProcess(input: NewProcessInput, existing: readonly Process[]): AddProcessResult {
  const id = input.id.replace(/\s+/g, '');
  if (!/^\d{4,8}$/.test(id)) {
    return { ok: false, error: 'O número do processo tem de ter só algarismos (por exemplo 260098).' };
  }
  if (existing.some((p) => p.id === id)) {
    return { ok: false, error: `Já existe um processo com o número ${id}.` };
  }
  return { ok: true, process: { id, name: id, folder: id } };
}

type MetaStore = Pick<PhotoStore, 'getMeta' | 'setMeta'>;
const KEY = 'local-processes';

/** Lista de processos criados neste telemóvel. */
export class LocalProcessList {
  private readonly store: MetaStore;

  constructor(store: MetaStore) {
    this.store = store;
  }

  async list(): Promise<Process[]> {
    return (await this.store.getMeta<Process[]>(KEY)) ?? [];
  }

  async add(input: NewProcessInput): Promise<AddProcessResult> {
    const current = await this.list();
    const result = buildLocalProcess(input, current);
    if (result.ok) await this.store.setMeta(KEY, [...current, result.process]);
    return result;
  }

  /** Tira o processo da lista (as fotos já guardadas na pasta do telemóvel não se apagam). */
  async remove(id: string): Promise<void> {
    const current = await this.list();
    await this.store.setMeta(
      KEY,
      current.filter((p) => p.id !== id),
    );
  }
}
