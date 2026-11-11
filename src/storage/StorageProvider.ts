import type { Process } from '../types.ts';

export interface UploadRequest {
  /**
   * Pasta de destino completa, relativa à raiz dos processos (ex.: "2026/02 Fevereiro/260098 - Praça de Portugal 7 Odivelas - Ana/2. Fotos/Cozinha").
   * Se ainda não existir, a implementação cria-a.
   */
  folder: string;
  fileName: string;
  blob: Blob;
}

export interface UploadResult {
  remotePath: string;
}

/**
 * Tudo o que a app precisa do "sítio onde os processos vivem".
 * Hoje há uma versão local de demonstração; no passo seguinte entra uma versão
 * que fala com o SharePoint/OneDrive (Microsoft Graph). O resto da app não muda.
 *
 * Regras para qualquer implementação:
 *  - Os nomes de ficheiro são únicos por construção, por isso, se o ficheiro já existir,
 *    substituí-lo é seguro e torna o reenvio idempotente (sem duplicados).
 *  - Falhas temporárias (rede, 429, 5xx): lançar UploadError normal (é reenviado sozinho).
 *  - Falhas definitivas (sem permissão, pasta inexistente): UploadError com retryable: false.
 */
export interface StorageProvider {
  readonly name: string;
  /** false = guarda no próprio telemóvel e funciona sem rede; true = envia por rede e espera pela ligação. */
  readonly needsNetwork: boolean;
  listProcesses(): Promise<Process[]>;
  uploadPhoto(req: UploadRequest): Promise<UploadResult>;
}

export class UploadError extends Error {
  readonly retryable: boolean;

  constructor(message: string, opts: { retryable?: boolean } = {}) {
    super(message);
    this.name = 'UploadError';
    this.retryable = opts.retryable ?? true;
  }
}
