import type { PhotoStatus } from './types.ts';

export const STATUS_LABEL: Record<PhotoStatus, string> = {
  pending: 'Por guardar',
  uploading: 'A guardar…',
  sent: 'Guardada',
  error: 'Erro',
};

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'medium' });
}

export function formatPhotoCount(n: number): string {
  if (n === 0) return 'Sem fotos';
  return `${n} foto${n === 1 ? '' : 's'}`;
}

/** "4032 × 3024 px · 12,2 MP" */
export function formatResolution(width: number, height: number): string {
  const mp = ((width * height) / 1_000_000).toFixed(1).replace('.', ',');
  return `${width} × ${height} px · ${mp} MP`;
}
