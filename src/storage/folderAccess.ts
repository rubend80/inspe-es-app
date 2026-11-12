import type { PhotoStore } from './PhotoStore.ts';

/**
 * Onde, no telemóvel, ficam as fotos.
 *  - "picked": uma pasta do telemóvel escolhida pelo inspetor (aparece no gestor de ficheiros).
 *    Usa a "File System Access API" do Chrome para Android (versão 132 ou superior).
 *  - "private": a memória interna da própria app (não aparece no gestor de ficheiros). Só serve de reserva.
 */
export type FolderState = 'none' | 'needs-permission' | 'ready' | 'unsupported';

type PermissionResult = 'granted' | 'denied' | 'prompt';

// Só o que usamos das pastas/ficheiros do browser (o TypeScript não traz os tipos todos).
export interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}
export interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
  getFile?(): Promise<Blob>;
}
export interface DirHandleLike {
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionResult>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionResult>;
}

export interface FolderAccess {
  readonly kind: 'picked' | 'private';
  /** Memória interna usada só porque este Chrome não deixa escolher uma pasta (as fotos não aparecem nos Ficheiros). */
  readonly degraded: boolean;
  /** Nome para mostrar ao inspetor. */
  label(): Promise<string>;
  state(): Promise<FolderState>;
  /** A pasta onde escrever; undefined enquanto não estiver pronta. */
  getRoot(): Promise<DirHandleLike | undefined>;
  /** Abre o seletor de pastas do Android (só funciona a partir de um toque). Devolve false se cancelou. */
  choose(): Promise<boolean>;
  /** Pede autorização para voltar a escrever na pasta (só funciona a partir de um toque). */
  authorize(): Promise<boolean>;
  /** Faz o que for preciso (escolher ou autorizar) para ficar pronta. Só a partir de um toque. */
  ensureReady(): Promise<boolean>;
}

type MetaStore = Pick<PhotoStore, 'getMeta' | 'setMeta'>;

export interface PickerOptions {
  id: string;
  mode: 'readwrite';
  startIn: 'documents';
}
export type DirectoryPicker = (options: PickerOptions) => Promise<DirHandleLike>;

const HANDLE_KEY = 'folder-handle';

function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';
}

export class PickedFolderAccess implements FolderAccess {
  readonly kind = 'picked' as const;
  readonly degraded = false;
  private readonly store: MetaStore;
  private readonly picker: DirectoryPicker;
  private handle: DirHandleLike | undefined;

  constructor(store: MetaStore, picker: DirectoryPicker) {
    this.store = store;
    this.picker = picker;
  }

  private async load(): Promise<DirHandleLike | undefined> {
    if (!this.handle) this.handle = await this.store.getMeta<DirHandleLike>(HANDLE_KEY);
    return this.handle;
  }

  async label(): Promise<string> {
    return (await this.load())?.name ?? 'Pasta do telemóvel';
  }

  async state(): Promise<FolderState> {
    const handle = await this.load();
    if (!handle) return 'none';
    try {
      const permission = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted';
      return permission === 'granted' ? 'ready' : 'needs-permission';
    } catch {
      return 'needs-permission';
    }
  }

  async getRoot(): Promise<DirHandleLike | undefined> {
    return (await this.state()) === 'ready' ? this.handle : undefined;
  }

  async choose(): Promise<boolean> {
    try {
      const handle = await this.picker({ id: 'inspecoes-fotos', mode: 'readwrite', startIn: 'documents' });
      this.handle = handle;
      await this.store.setMeta(HANDLE_KEY, handle);
      return true;
    } catch (err) {
      if (isAbort(err)) return false; // o inspetor cancelou
      throw err;
    }
  }

  async authorize(): Promise<boolean> {
    const handle = await this.load();
    if (!handle) return false;
    if (!handle.requestPermission) return true;
    try {
      return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
    } catch {
      return false;
    }
  }

  async ensureReady(): Promise<boolean> {
    const state = await this.state();
    if (state === 'ready') return true;
    if (state === 'none') {
      if (!(await this.choose())) return false;
      return (await this.state()) === 'ready' || (await this.authorize());
    }
    return this.authorize();
  }
}

/** Memória interna da app (OPFS): funciona em qualquer Chrome recente, mas o inspetor não vê os ficheiros. */
export class PrivateFolderAccess implements FolderAccess {
  readonly kind = 'private' as const;
  readonly degraded: boolean;

  /** degraded = true quando é só um recurso por falta de seletor de pastas (false quando foi pedido de propósito, nos testes). */
  constructor(degraded = false) {
    this.degraded = degraded;
  }

  async label(): Promise<string> {
    return 'Memória interna da app';
  }

  async state(): Promise<FolderState> {
    return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function' ? 'ready' : 'unsupported';
  }

  async getRoot(): Promise<DirHandleLike | undefined> {
    if ((await this.state()) !== 'ready') return undefined;
    const root = await navigator.storage.getDirectory();
    return (await root.getDirectoryHandle('Fotos', { create: true })) as unknown as DirHandleLike;
  }

  async choose(): Promise<boolean> {
    return false;
  }
  async authorize(): Promise<boolean> {
    return true;
  }
  async ensureReady(): Promise<boolean> {
    return (await this.state()) === 'ready';
  }
}

/**
 * Escolhe a melhor forma de guardar neste telemóvel:
 * pasta à escolha se o Chrome o permitir; senão a memória interna. "?storage=private" força a interna (testes).
 */
export function createFolderAccess(store: MetaStore, search = ''): FolderAccess {
  const win = typeof window === 'undefined' ? undefined : (window as unknown as { showDirectoryPicker?: DirectoryPicker });
  const forcePrivate = new URLSearchParams(search).get('storage') === 'private';
  if (!forcePrivate && win && typeof win.showDirectoryPicker === 'function') {
    const pick = win.showDirectoryPicker.bind(win);
    return new PickedFolderAccess(store, pick);
  }
  return new PrivateFolderAccess(!forcePrivate);
}
