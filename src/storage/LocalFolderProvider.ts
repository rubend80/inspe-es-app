import type { Process } from '../types.ts';
import type { FolderAccess, FolderState } from './folderAccess.ts';
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

    try {
      let dir = root;
      for (const segment of segments) dir = await dir.getDirectoryHandle(segment, { create: true });
      const file = await dir.getFileHandle(req.fileName, { create: true });
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
    return { remotePath: `${req.folder}/${req.fileName}` };
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
