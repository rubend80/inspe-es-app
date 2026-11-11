import { Capacitor, registerPlugin } from '@capacitor/core';

/** Uma foto da galeria do telemóvel (MediaStore do Android). */
export interface MediaItem {
  id: string;
  uri: string;
  name: string;
  mime: string;
  size: number;
  /** milissegundos */
  dateAdded: number;
  /** milissegundos (0 se o telemóvel não souber) */
  dateTaken: number;
  width: number;
  height: number;
}

/** Ponte para o código Android (android-src/NativePhotosPlugin.java). Só existe na app instalada (APK). */
export interface NativePhotosPlugin {
  /** Pede (se preciso) autorização para ler as fotos e, nos Android antigos, para escrever. */
  ensurePermission(): Promise<{ granted: boolean }>;
  /** Abre a câmara normal do telemóvel (várias fotos seguidas). */
  openCamera(): Promise<{ since: number }>;
  /** Fotos que entraram na galeria desde "since" (ms), mais antigas primeiro. Não inclui as cópias da app. */
  listSince(options: { since: number }): Promise<{ items: MediaItem[] }>;
  /** Copia uma foto da galeria, tal e qual, para Documents/<folder>/<fileName>. Devolve o caminho. */
  copy(options: { uri: string; folder: string; fileName: string; mime: string }): Promise<{ path: string }>;
  /** Escreve um ficheiro (base64) em Documents/<folder>/<fileName>. Devolve o caminho. */
  writeFile(options: { folder: string; fileName: string; mime: string; data: string }): Promise<{ path: string }>;
  /** Miniatura JPEG (base64) de uma foto da galeria. */
  thumbnail(options: { uri: string; size: number }): Promise<{ data: string }>;
}

export const NativePhotos = registerPlugin<NativePhotosPlugin>('NativePhotos');

/** Está a correr como app Android instalada (e não no Chrome)? */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Pasta-raiz dentro de "Documents" no telemóvel. */
export const NATIVE_ROOT = 'Inspeções';

export function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler a foto.'));
    reader.readAsDataURL(blob);
  });
}
