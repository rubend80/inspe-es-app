import { blobToBase64, NATIVE_ROOT, NativePhotos } from '../native/nativePhotos.ts';
import type { Process } from '../types.ts';
import { UploadError } from './StorageProvider.ts';
import type { StorageProvider, UploadRequest, UploadResult } from './StorageProvider.ts';

/**
 * App Android instalada: guarda as fotos em Documents/Inspeções/<processo>/2. Fotos/<divisão>/ no telemóvel
 * (vê-se na app Ficheiros). Não é preciso escolher pasta nem dar autorização para escrever (Android 10 ou mais recente).
 */
export class NativeFolderProvider implements StorageProvider {
  readonly name = 'Telemóvel';
  readonly needsNetwork = false;
  private readonly processes: { list(): Promise<Process[]> };

  constructor(processes: { list(): Promise<Process[]> }) {
    this.processes = processes;
  }

  listProcesses(): Promise<Process[]> {
    return this.processes.list();
  }

  async uploadPhoto(req: UploadRequest): Promise<UploadResult> {
    const segments = req.folder.split('/').filter((s) => s !== '');
    if (segments.some((s) => s === '.' || s === '..') || req.fileName.includes('/')) {
      throw new UploadError('Nome de pasta ou de ficheiro inválido.', { retryable: false });
    }
    try {
      const data = await blobToBase64(req.blob);
      const { path } = await NativePhotos.writeFile({
        folder: [NATIVE_ROOT, ...segments].join('/'),
        fileName: req.fileName,
        mime: req.blob.type || 'image/jpeg',
        data,
      });
      return { remotePath: path };
    } catch (err) {
      throw new UploadError(`Não foi possível gravar no telemóvel: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
