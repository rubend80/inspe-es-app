import { remotePathFor } from '../naming.ts';
import { processFromFolder } from '../processNames.ts';
import type { Process } from '../types.ts';
import { openDb, transactionDone } from './idb.ts';
import { UploadError } from './StorageProvider.ts';
import type { StorageProvider, UploadRequest, UploadResult } from './StorageProvider.ts';

/**
 * Processos de exemplo (nomes inventados), só para a fase de desenvolvimento.
 * Seguem a estrutura real: <ano>/<mês>/<n.º> - <morada> - <cliente>.
 */
const DEMO_FOLDERS = [
  '2026/01 Janeiro/260003 - Escola Básica n.º 3 Amadora - Município Demo',
  '2026/05 Maio/260064 - Armazém Zona Industrial Almada - Logística Demo Lda',
  '2026/07 Julho/260097 - Moradia Quinta do Pinhal Sintra - Marta Exemplo',
  '2026/09 Setembro/260121 - Edifício Atlântico Bloco B Oeiras - Condomínio Demo',
  '2026/10 Outubro/260138 - Av. da Liberdade 210 Lisboa - Rui Teste',
  '2026/11 Novembro/260142 - Moradia Rua das Flores 12 Lisboa - Ana Exemplo',
];

export const DEMO_PROCESSES: Process[] = DEMO_FOLDERS.flatMap((f) => processFromFolder(f) ?? []);

const FAIL_KEY = 'demo:simulate-failure';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * "SharePoint de faz de conta": não guarda as fotos (para não duplicar espaço no telemóvel),
 * só regista o caminho onde ficariam. Serve para desenvolver e testar a captura e a fila de envio.
 */
export class LocalDemoProvider implements StorageProvider {
  readonly name = 'Demonstração (local)';
  readonly needsNetwork = true; // finge ser um servidor remoto
  private readonly latencyMs: number;

  constructor(opts: { latencyMs?: number } = {}) {
    this.latencyMs = opts.latencyMs ?? 700;
  }

  /** Quando ligado, todos os envios falham (para testar a fila e o reenvio). */
  isFailureSimulated(): boolean {
    try {
      return localStorage.getItem(FAIL_KEY) === '1';
    } catch {
      return false;
    }
  }

  setFailureSimulated(on: boolean): void {
    try {
      if (on) localStorage.setItem(FAIL_KEY, '1');
      else localStorage.removeItem(FAIL_KEY);
    } catch {
      /* sem localStorage: ignora */
    }
  }

  async listProcesses(): Promise<Process[]> {
    await sleep(Math.min(this.latencyMs, 300));
    return DEMO_PROCESSES.map((p) => ({ ...p }));
  }

  async uploadPhoto(req: UploadRequest): Promise<UploadResult> {
    await sleep(this.latencyMs);
    if (this.isFailureSimulated()) {
      throw new UploadError('Falha de envio simulada (modo de teste).');
    }
    const path = remotePathFor(req.folder, req.fileName);
    const db = await openDb();
    const tx = db.transaction('remote', 'readwrite');
    tx.objectStore('remote').put({ path, size: req.blob.size, savedAt: Date.now() });
    await transactionDone(tx);
    return { remotePath: path };
  }
}
