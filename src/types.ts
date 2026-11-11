export interface Process {
  /** Identificador estável do processo (no SharePoint: o nome da pasta ou o id do item). */
  id: string;
  /** Texto mostrado ao inspetor (a morada). */
  name: string;
  /** Nome do cliente, quando a pasta o indica. */
  client?: string;
  /** Pasta do processo, relativa à raiz dos processos (ex.: "2026/02 Fevereiro/260098 - Praça de Portugal 7 Odivelas - Ana"). */
  folder: string;
}

/** Uma divisão da casa (Hall, Cozinha, Quarto 1...). Cada uma é uma pasta dentro do processo. */
export interface Division {
  /** Estável; usado nos endereços da app e para contar as fotos. */
  id: string;
  /** Texto mostrado ao inspetor. */
  name: string;
  /** Nome da pasta no destino (sem caracteres proibidos). */
  folder: string;
}

/**
 * Uma fração (apartamento ou outra unidade de um prédio). É opcional: numa moradia não há frações.
 * Quando existe, fica uma pasta com o seu nome entre "2. Fotos" e a divisão.
 */
export interface Fraction {
  /** Estável; usado nos endereços da app e para contar as fotos. */
  id: string;
  /** Texto mostrado ao inspetor (ex.: "Fração A", "1.º Esq."). */
  name: string;
  /** Nome da pasta no destino (sem caracteres proibidos). */
  folder: string;
}

export type PhotoStatus = 'pending' | 'uploading' | 'sent' | 'error';

export interface PhotoRecord {
  id: string;
  processId: string;
  processName: string;
  processFolder: string;
  divisionId: string;
  divisionName: string;
  divisionFolder: string;
  /** Fração em que a foto foi tirada. Ausente = sem fração (fotos antigas ou imóveis sem frações). */
  fractionId?: string;
  fractionName?: string;
  fractionFolder?: string;
  fileName: string;
  takenAt: number;
  mimeType: string;
  size: number;
  status: PhotoStatus;
  attempts: number;
  lastError?: string;
  /** Quando o próximo reenvio automático pode acontecer (ms desde 1970). Ausente = já. */
  nextRetryAt?: number;
  /** false = não reenviar sozinho; só quando o inspetor pedir. */
  retryable?: boolean;
  /** Onde ficou o original (assim que seguiu). */
  remotePath?: string;
  /** Onde ficou a versão leve (assim que seguiu). A foto só passa a "enviada" com as duas. */
  lightRemotePath?: string;
  lightSize?: number;
  sentAt?: number;
  /** Foto original. Apagada depois de enviada, para libertar espaço no telemóvel. */
  blob?: Blob;
  /** Miniatura pequena para a grelha. */
  thumb?: Blob;
  /** Pré-visualização maior para o detalhe; fica depois de a original ser apagada. */
  preview?: Blob;
  /** Dimensões da foto original, em píxeis. */
  width?: number;
  height?: number;
}
