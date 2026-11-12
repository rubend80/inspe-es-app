import { buildPhotoFileName, remoteFolderFor, uniqueFileName } from './naming.ts';
import type { UploadQueue } from './queue.ts';
import type { PhotoStore } from './storage/PhotoStore.ts';
import type { Division, Fraction, PhotoRecord, Process } from './types.ts';

/** O que se tira de uma foto para a mostrar na app (a original segue inalterada para o envio). */
export interface ImageInfo {
  width?: number;
  height?: number;
  thumb?: Blob;
  preview?: Blob;
}

export type ImageProcessor = (blob: Blob) => Promise<ImageInfo>;

/** Junta tudo o que acontece quando se tira uma foto: nome, gravação local, miniatura e envio. */
export class PhotoService {
  private readonly store: PhotoStore;
  private readonly queue: UploadQueue;
  private readonly processImage: ImageProcessor;
  private readonly newId: () => string;

  constructor(
    store: PhotoStore,
    queue: UploadQueue,
    processImage: ImageProcessor,
    newId: () => string = () => crypto.randomUUID(),
  ) {
    this.store = store;
    this.queue = queue;
    this.processImage = processImage;
    this.newId = newId;
  }

  async addPhoto(
    process: Process,
    division: Division,
    blob: Blob,
    takenAt: Date = new Date(),
    fraction?: Fraction,
  ): Promise<PhotoRecord> {
    // Nome e gravação um de cada vez (nomes únicos); a miniatura faz-se depois, sem atrasar a foto seguinte.
    const record = await this.oneAtATime(() => this.addPhotoNow(process, division, blob, takenAt, fraction));
    const info = await this.processImage(blob);
    const patch: Partial<PhotoRecord> = {};
    if (info.thumb) patch.thumb = info.thumb;
    if (info.preview) patch.preview = info.preview;
    if (info.width && info.height) {
      patch.width = info.width;
      patch.height = info.height;
    }
    if (Object.keys(patch).length > 0) {
      await this.store.update(record.id, patch);
      this.queue.notify();
    }
    return record;
  }

  /** Fotos tiradas seguidas são registadas uma a uma, para nunca terem o mesmo nome na mesma pasta. */
  private chain: Promise<unknown> = Promise.resolve();
  private oneAtATime<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Nome livre na pasta onde a foto vai ficar (data_hora, e _2, _3... se houver outra no mesmo segundo). */
  private async freeName(process: Process, division: Division, fraction: Fraction | undefined, takenAt: Date, mimeType: string): Promise<string> {
    const folder = remoteFolderFor(process.folder, division.folder, fraction?.folder);
    const taken = new Set(
      (await this.store.listByProcess(process.id))
        .filter((p) => remoteFolderFor(p.processFolder, p.divisionFolder, p.fractionFolder) === folder)
        .map((p) => p.fileName),
    );
    return uniqueFileName(buildPhotoFileName({ takenAt, mimeType }), taken);
  }

  private async addPhotoNow(
    process: Process,
    division: Division,
    blob: Blob,
    takenAt: Date,
    fraction?: Fraction,
  ): Promise<PhotoRecord> {
    const mimeType = blob.type || 'image/jpeg';
    const record: PhotoRecord = {
      id: this.newId(),
      processId: process.id,
      processName: process.name,
      processFolder: process.folder,
      divisionId: division.id,
      divisionName: division.name,
      divisionFolder: division.folder,
      ...(fraction ? { fractionId: fraction.id, fractionName: fraction.name, fractionFolder: fraction.folder } : {}),
      fileName: await this.freeName(process, division, fraction, takenAt, mimeType),
      takenAt: takenAt.getTime(),
      mimeType,
      size: blob.size,
      status: 'pending',
      attempts: 0,
      blob,
    };
    // 1.º guardar (a foto fica segura de imediato); miniatura, pré-visualização e dimensões vêm depois.
    await this.queue.enqueue(record);
    return record;
  }

  /**
   * Foto que já foi gravada diretamente na pasta (app Android: copiada da galeria, tal e qual).
   * Dá-lhe o nome e a pasta de sempre, chama saveTo(pasta, nome) para a gravar e regista-a como "Guardada".
   */
  async addSavedPhoto(
    process: Process,
    division: Division,
    fraction: Fraction | undefined,
    info: { takenAt: Date; mimeType: string; size: number; width?: number; height?: number },
    saveTo: (folder: string, fileName: string) => Promise<string>,
  ): Promise<PhotoRecord> {
    return this.oneAtATime(async () => {
    const fileName = await this.freeName(process, division, fraction, info.takenAt, info.mimeType);
    const remotePath = await saveTo(remoteFolderFor(process.folder, division.folder, fraction?.folder), fileName);
    const record: PhotoRecord = {
      id: this.newId(),
      processId: process.id,
      processName: process.name,
      processFolder: process.folder,
      divisionId: division.id,
      divisionName: division.name,
      divisionFolder: division.folder,
      ...(fraction ? { fractionId: fraction.id, fractionName: fraction.name, fractionFolder: fraction.folder } : {}),
      fileName,
      takenAt: info.takenAt.getTime(),
      mimeType: info.mimeType,
      size: info.size,
      status: 'sent',
      attempts: 0,
      remotePath,
      ...(info.width && info.height ? { width: info.width, height: info.height } : {}),
    };
    await this.store.add(record);
    this.queue.notify();
    return record;
    });
  }

  /** Junta a miniatura e a pré-visualização a uma foto já registada. */
  async setPreviews(id: string, thumb?: Blob, preview?: Blob): Promise<void> {
    const patch: Partial<PhotoRecord> = {};
    if (thumb) patch.thumb = thumb;
    if (preview) patch.preview = preview;
    if (Object.keys(patch).length === 0) return;
    await this.store.update(id, patch);
    this.queue.notify();
  }

  deletePhoto(id: string): Promise<boolean> {
    return this.queue.discard(id);
  }
}
