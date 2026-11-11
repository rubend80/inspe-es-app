import { folderNameFor } from './naming.ts';
import type { PhotoStore } from './storage/PhotoStore.ts';
import type { Process } from './types.ts';

/**
 * Sem ligação ao OneDrive, os processos são criados no próprio telemóvel.
 * A pasta de cada um segue a convenção da empresa: "<n.º> - <morada> - <cliente>".
 */
export interface NewProcessInput {
  id: string;
  address: string;
  client?: string;
}

export type AddProcessResult = { ok: true; process: Process } | { ok: false; error: string };

export const MAX_ADDRESS = 80;
export const MAX_CLIENT = 60;

/** Texto para nome de pasta: sem caracteres proibidos e sem " - " (que é o separador do nome do processo). */
function cleanPart(text: string, max: number): string {
  return folderNameFor(text.replace(/\s+[-–—]\s+/g, ', ')).slice(0, max).trim();
}

export function buildLocalProcess(input: NewProcessInput, existing: readonly Process[]): AddProcessResult {
  const id = input.id.replace(/\s+/g, '');
  if (!/^\d{4,8}$/.test(id)) {
    return { ok: false, error: 'O número do processo tem de ter só algarismos (por exemplo 260098).' };
  }
  const address = cleanPart(input.address, MAX_ADDRESS);
  if (!address) return { ok: false, error: 'Indique a morada.' };
  const client = cleanPart(input.client ?? '', MAX_CLIENT);
  if (existing.some((p) => p.id === id)) {
    return { ok: false, error: `Já existe um processo com o número ${id}.` };
  }
  const folder = client ? `${id} - ${address} - ${client}` : `${id} - ${address}`;
  const process: Process = { id, name: address, folder };
  if (client) process.client = client;
  return { ok: true, process };
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
