import { lightFileNameFor, remoteFolderFor, remoteLightFolderFor } from './naming.ts';
import { UploadError } from './storage/StorageProvider.ts';
import type { StorageProvider } from './storage/StorageProvider.ts';
import type { PhotoStore } from './storage/PhotoStore.ts';
import type { PhotoRecord } from './types.ts';

export interface QueueOptions {
  /** Devolve false quando o telemóvel está sem rede (por defeito, navigator.onLine). */
  isOnline?: () => boolean;
  now?: () => number;
  /** Espera antes do 1.º reenvio; duplica a cada falha seguida. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /**
   * Cria a versão leve (JPEG reduzido) a partir do original. Quando existe, cada foto vai duas vezes
   * (original e versão leve) e só fica "enviada" com as duas no destino. Sem isto, vai só o original.
   */
  makeLight?: (original: Blob) => Promise<Blob>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Fila de envio: as fotos ficam guardadas no telemóvel e seguem uma a uma para o processo.
 * Estados: pending (por enviar) → uploading (a enviar) → sent (enviada) ou error (falhou).
 * Falhas temporárias são repetidas sozinhas com espera crescente; sem rede, espera pelo evento "online".
 */
export class UploadQueue {
  private readonly store: PhotoStore;
  private readonly provider: StorageProvider;
  private readonly isOnline: () => boolean;
  private readonly now: () => number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly makeLight: ((original: Blob) => Promise<Blob>) | undefined;

  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(store: PhotoStore, provider: StorageProvider, opts: QueueOptions = {}) {
    this.store = store;
    this.provider = provider;
    // Só conta como "sem rede" quando o sistema o diz explicitamente (onLine === false).
    this.isOnline = opts.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    this.now = opts.now ?? (() => Date.now());
    this.baseDelayMs = opts.baseDelayMs ?? 15_000;
    this.maxDelayMs = opts.maxDelayMs ?? 10 * 60_000;
    this.makeLight = opts.makeLight;
  }

  /** Avisa sempre que algo muda (estado de uma foto, foto nova, foto eliminada). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(): void {
    for (const l of this.listeners) l();
  }

  /** A app foi fechada a meio de um envio: o que ficou "a enviar" volta a "por enviar". */
  async recover(): Promise<void> {
    const stuck = (await this.store.list()).filter((p) => p.status === 'uploading');
    for (const p of stuck) await this.store.update(p.id, { status: 'pending' });
    if (stuck.length > 0) this.notify();
  }

  async enqueue(photo: PhotoRecord): Promise<void> {
    await this.store.add(photo);
    this.notify();
    void this.kick();
  }

  /** Põe a fila a trabalhar. Se já estiver a trabalhar, garante mais uma volta no fim. */
  kick(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const run = this.loop().finally(() => {
      this.running = null;
    });
    this.running = run;
    return run;
  }

  /** Volta a pôr em fila as fotos com erro (botão "Tentar novamente"). */
  async retryAll(): Promise<void> {
    const failed = (await this.store.list()).filter((p) => p.status === 'error');
    for (const p of failed) await this.resetForRetry(p.id);
    if (failed.length > 0) this.notify();
    await this.kick();
  }

  async retry(id: string): Promise<void> {
    await this.resetForRetry(id);
    this.notify();
    await this.kick();
  }

  /** Elimina uma foto que ainda não foi enviada. Devolve false se não for possível. */
  async discard(id: string): Promise<boolean> {
    const p = await this.store.get(id);
    if (!p || p.status === 'sent' || p.status === 'uploading') return false;
    await this.store.remove(id);
    this.notify();
    return true;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private async resetForRetry(id: string): Promise<void> {
    await this.store.update(id, {
      status: 'pending',
      nextRetryAt: undefined,
      retryable: undefined,
    });
  }

  private async loop(): Promise<void> {
    do {
      this.again = false;
      await this.processAll();
    } while (this.again);
  }

  private async processAll(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (;;) {
      if (this.provider.needsNetwork && !this.isOnline()) return; // o evento "online" volta a chamar kick()
      const next = await this.pickNext();
      if (!next) break;
      await this.upload(next);
    }
    await this.scheduleRetry();
  }

  private async pickNext(): Promise<PhotoRecord | undefined> {
    const now = this.now();
    const all = await this.store.list();
    return all
      .filter(
        (p) =>
          p.status === 'pending' ||
          (p.status === 'error' && p.retryable !== false && (p.nextRetryAt ?? 0) <= now),
      )
      .sort((a, b) => a.takenAt - b.takenAt)[0];
  }

  private async upload(photo: PhotoRecord): Promise<void> {
    await this.store.update(photo.id, { status: 'uploading', lastError: undefined });
    this.notify();
    let step: 'original' | 'leve' = 'original';
    try {
      if (!photo.blob) {
        throw new UploadError('A foto já não está guardada no telemóvel.', { retryable: false });
      }

      // 1.º o original (o que mais importa). Se já seguiu numa tentativa anterior, não se repete.
      let remotePath = photo.remotePath;
      if (!remotePath) {
        const result = await this.provider.uploadPhoto({
          folder: remoteFolderFor(photo.processFolder, photo.divisionFolder, photo.fractionFolder),
          fileName: photo.fileName,
          blob: photo.blob,
        });
        remotePath = result.remotePath;
        await this.store.update(photo.id, { remotePath });
      }

      // 2.º a versão leve, feita agora a partir do original (não ocupa espaço entretanto).
      if (this.makeLight && !photo.lightRemotePath) {
        step = 'leve';
        let light: Blob;
        try {
          light = await this.makeLight(photo.blob);
        } catch (err) {
          throw new UploadError(`Não foi possível criar a versão leve (${errorMessage(err)}).`, { retryable: false });
        }
        const result = await this.provider.uploadPhoto({
          folder: remoteLightFolderFor(photo.processFolder, photo.divisionFolder, photo.fractionFolder),
          fileName: lightFileNameFor(photo.fileName),
          blob: light,
        });
        await this.store.update(photo.id, { lightRemotePath: result.remotePath, lightSize: light.size });
      }

      await this.store.update(photo.id, {
        status: 'sent',
        sentAt: this.now(),
        blob: undefined,
        lastError: undefined,
        nextRetryAt: undefined,
        retryable: undefined,
      });
    } catch (err) {
      const retryable = err instanceof UploadError ? err.retryable : true;
      const delay = Math.min(this.baseDelayMs * 2 ** photo.attempts, this.maxDelayMs);
      await this.store.update(photo.id, {
        status: 'error',
        attempts: photo.attempts + 1,
        // Se o original já seguiu e falhou a versão leve, diz-se (a foto fica com o original no sítio certo).
        lastError: step === 'leve' && !(err instanceof UploadError && !err.retryable) ? `Versão leve: ${errorMessage(err)}` : errorMessage(err),
        retryable,
        nextRetryAt: retryable ? this.now() + delay : undefined,
      });
    }
    this.notify();
  }

  private async scheduleRetry(): Promise<void> {
    const times = (await this.store.list())
      .filter((p) => p.status === 'error' && p.retryable !== false && p.nextRetryAt !== undefined)
      .map((p) => p.nextRetryAt as number);
    if (times.length === 0) return;
    const wait = Math.max(0, Math.min(...times) - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.kick();
    }, wait);
  }
}
