import type { PhotoRecord } from './types.ts';

export interface Summary {
  pending: number;
  uploading: number;
  error: number;
  sent: number;
}

export function summarize(photos: PhotoRecord[]): Summary {
  const s: Summary = { pending: 0, uploading: 0, error: 0, sent: 0 };
  for (const p of photos) s[p.status] += 1;
  return s;
}

/** Fotos que ainda não chegaram ao processo. */
export function unsentCount(s: Summary): number {
  return s.pending + s.uploading + s.error;
}
