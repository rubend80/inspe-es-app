import type { Process } from '../types.ts';
import type { DirHandleLike, FolderAccess, FolderState } from './folderAccess.ts';
import { UploadError } from './StorageProvider.ts';
import type { StorageProvider, UploadRequest, UploadResult } from './StorageProvider.ts';

/** Guarda as fotos numa pasta do próprio telemóvel, com a mesma estrutura de pastas do processo. */
export class LocalFolderProvider implements StorageProvider {
  readonly name = 'Telemóvel';
  /** Escrever no telemóvel não precisa de rede. */
  readonly needsNetwork = false;
  private readonly access: FolderAccess;
  private readonly processes: { list(): Promise<Process[]> };

  constructor(access: FolderAccess, processes: { list(): Promise<Process[]> }) {
    this.access = access;
    this.processes = processes;
  }

  listProcesses(): Promise<Process[]> {
    return this.processes.list();
  }

  async deleteProcessFolder(processFolder: string): Promise<{ deleted: number; failed: number }> {
    const root = await this.access.getRoot();
    if (!root?.removeEntry || !processFolder || processFolder.includes('/')) return { deleted: 0, failed: 0 };
    try {
      await root.removeEntry(processFolder, { recursive: true });
      return { deleted: 1, failed: 0 };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') return { deleted: 0, failed: 0 };
      return { deleted: 0, failed: 1 };
    }
  }

  async uploadPhoto(req: UploadRequest): Promise<UploadResult> {
    const segments = req.folder.split('/').filter((s) => s !== '');
    if (segments.some((s) => s === '.' || s === '..') || req.fileName.includes('/') || req.fileName.includes('\\')) {
      throw new UploadError('Nome de pasta ou de ficheiro inválido.', { retryable: false });
    }

    const root = await this.access.getRoot();
    if (!root) {
      const state = await this.access.state();
      throw new UploadError(notReadyMessage(state), { retryable: state !== 'unsupported' });
    }

    let fileName = req.fileName;
    try {
      let dir = root;
      for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create: true });
      // Nunca escrever por cima de outra foto (ex.: a app foi limpa e há uma foto do mesmo segundo).
      // Se já lá estiver um ficheiro com o mesmo tamanho, é esta mesma foto (nova tentativa): escreve por cima.
      fileName = await freeNameIn(dir, req.fileName, req.blob.size);
      const file = await dir.getFileHandle(fileName, { create: true });
      const writable = await file.createWritable();
      try {
        await writable.write(req.blob);
        await writable.close();
      } catch (err) {
        await writable.abort?.().catch(() => undefined);
        throw err;
      }
    } catch (err) {
      throw friendlyError(err);
    }
    return { remotePath: `${req.folder}/${fileName}` };
  }
}

function notReadyMessage(state: FolderState): string {
  switch (state) {
    case 'none':
      return 'Falta escolher a pasta do telemóvel onde guardar as fotos.';
    case 'needs-permission':
      return 'Falta autorizar a pasta de fotos (toque em "Autorizar").';
    case 'unsupported':
      return 'Este navegador não permite guardar as fotos numa pasta. Use o Chrome atualizado.';
    default:
      return 'A pasta de fotos não está disponível.';
  }
}

function friendlyError(err: unknown): Error {
  const name = typeof err === 'object' && err !== null ? (err as { name?: string }).name : undefined;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new UploadError('Sem autorização para guardar na pasta (toque em "Autorizar").');
    case 'QuotaExceededError':
      return new UploadError('Sem espaço livre no telemóvel.');
    case 'NotFoundError':
      return new UploadError('A pasta escolhida já não existe. Escolha outra pasta.');
    default:
      return err instanceof Error ? err : new Error(String(err));
  }
}

async function freeNameIn(dir: DirHandleLike, fileName: string, size: number): Promise<string> {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? fileName : `${base}_${n}${ext}`;
    let existing: Blob | undefined;
    try {
      const handle = await dir.getFileHandle(candidate);
      existing = handle.getFile ? await handle.getFile() : undefined;
    } catch {
      return candidate; // não existe: livre
    }
    if (!existing || existing.size === size) return candidate;
  }
  return fileName;
}
