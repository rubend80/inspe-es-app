import { folderNameFor, slugify } from './naming.ts';
import type { Division, PhotoRecord } from './types.ts';

/** Divisões que aparecem em todos os processos, por esta ordem. */
export const DEFAULT_DIVISIONS: readonly Division[] = [
  { id: 'hall', name: 'Hall', folder: 'Hall' },
  { id: 'sala', name: 'Sala', folder: 'Sala' },
  { id: 'cozinha', name: 'Cozinha', folder: 'Cozinha' },
  { id: 'quarto-1', name: 'Quarto 1', folder: 'Quarto 1' },
  { id: 'quarto-2', name: 'Quarto 2', folder: 'Quarto 2' },
  { id: 'quarto-3', name: 'Quarto 3', folder: 'Quarto 3' },
  { id: 'casa-de-banho-1', name: 'Casa de banho 1', folder: 'Casa de banho 1' },
  { id: 'casa-de-banho-2', name: 'Casa de banho 2', folder: 'Casa de banho 2' },
  { id: 'garagem', name: 'Garagem', folder: 'Garagem' },
];

/** Sugestões ao acrescentar uma divisão que não está na lista (fachada, cobertura, varanda...). */
export const DIVISION_SUGGESTIONS = [
  'Fachada',
  'Cobertura',
  'Varanda',
  'Arrecadação',
  'Sótão',
  'Escadas',
  'Corredor',
  'Quarto 4',
  'Casa de banho 3',
  'Exterior',
  'Cave',
  'Quintal',
];

/** Cria uma divisão a partir de um nome escrito pelo inspetor. Devolve undefined se o nome não servir. */
export function makeDivision(rawName: string): Division | undefined {
  const cleaned = rawName.replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  if (!cleaned) return undefined;
  const name = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  const id = slugify(name);
  const folder = folderNameFor(name);
  if (!id || !folder) return undefined;
  return { id, name, folder };
}

/**
 * Divisões de um processo: as de origem, as acrescentadas pelo inspetor e, por segurança,
 * qualquer divisão que já tenha fotos (para nunca ficarem fotos "escondidas").
 */
export function divisionsForProcess(extras: Division[], photos: PhotoRecord[]): Division[] {
  const out: Division[] = [...DEFAULT_DIVISIONS];
  const seen = new Set(out.map((d) => d.id));
  for (const d of extras) {
    if (seen.has(d.id)) continue;
    out.push(d);
    seen.add(d.id);
  }
  for (const p of photos) {
    if (!p.divisionId || seen.has(p.divisionId)) continue;
    out.push({ id: p.divisionId, name: p.divisionName, folder: p.divisionFolder });
    seen.add(p.divisionId);
  }
  return out;
}

/** A divisão a seguir à atual (undefined se for a última). */
export function nextDivision(list: Division[], currentId: string): Division | undefined {
  const i = list.findIndex((d) => d.id === currentId);
  return i >= 0 ? list[i + 1] : undefined;
}
