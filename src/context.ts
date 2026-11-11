import type { LocalProcessList } from './localProcesses.ts';
import type { PhotoService } from './photoService.ts';
import type { UploadQueue } from './queue.ts';
import type { FolderAccess } from './storage/folderAccess.ts';
import type { LocalDemoProvider } from './storage/LocalDemoProvider.ts';
import type { PhotoStore } from './storage/PhotoStore.ts';
import type { StorageProvider } from './storage/StorageProvider.ts';
import type { Division, Fraction, Process } from './types.ts';

/** O que os ecrãs precisam de conhecer da app. */
export interface AppContext {
  store: PhotoStore;
  provider: StorageProvider;
  queue: UploadQueue;
  photos: PhotoService;
  /** Só existe na versão de demonstração (mostra o painel "Modo de teste"). */
  demo: LocalDemoProvider | null;
  /** Pasta do telemóvel onde ficam as fotos (null na demonstração). */
  folder: FolderAccess | null;
  /** Processos criados neste telemóvel: com isto há "Novo processo" (null na demonstração). */
  localProcesses: LocalProcessList | null;
  /** Lista de processos guardada no telemóvel (instantânea, funciona sem rede). */
  cachedProcesses(): Promise<Process[]>;
  /** Vai buscar a lista ao servidor; se falhar, devolve a guardada. */
  loadProcesses(): Promise<{ processes: Process[]; fromCache: boolean }>;
  findProcess(id: string): Promise<Process | undefined>;
  divisions: {
    /** Divisões do processo: as de origem, as acrescentadas pelo inspetor e as que já têm fotos. */
    list(processId: string): Promise<Division[]>;
    /** Acrescenta uma divisão a este processo (ou devolve a que já existe com esse nome). */
    add(processId: string, name: string): Promise<Division | undefined>;
  };
  fractions: {
    /** Frações do processo (apartamentos de um prédio): as acrescentadas pelo inspetor e as que já têm fotos. */
    list(processId: string): Promise<Fraction[]>;
    /** Acrescenta uma fração a este processo (ou devolve a que já existe com esse nome). */
    add(processId: string, name: string): Promise<Fraction | undefined>;
    /** Tira uma fração da lista. Só se ainda não tiver fotos; devolve false se não puder. */
    remove(processId: string, fractionId: string): Promise<boolean>;
  };
}
