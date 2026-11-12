import { folderNameFor, slugify } from './naming.ts';
import type { DivisionScope } from './divisions.ts';
import type { Fraction, PhotoRecord } from './types.ts';

/** Os espaços comuns do prédio funcionam como uma "fração" especial, com pasta própria e divisões próprias. */
export const COMMON_AREA: Fraction = { id: 'espacos-comuns', name: 'Espaços comuns', folder: 'Espaços comuns' };

/** Que lista de divisões usar: espaços comuns ou de fração (fração escolhida ou fração única). */
export function scopeOf(fraction?: Fraction | string): DivisionScope {
  const id = typeof fraction === 'string' ? fraction : fraction?.id;
  return id === COMMON_AREA.id ? 'common' : 'unit';
}

export const MAX_FRACTION_NAME = 40;

/** Cria uma fração a partir de um nome escrito pelo inspetor. Devolve undefined se o nome não servir. */
export function makeFraction(rawName: string): Fraction | undefined {
  const cleaned = rawName.replace(/\s+/g, ' ').trim().slice(0, MAX_FRACTION_NAME).trim();
  if (!cleaned) return undefined;
  const name = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  const id = slugify(name);
  const folder = folderNameFor(name);
  if (!id || !folder || id === COMMON_AREA.id) return undefined;
  return { id, name, folder };
}

/**
 * Frações de um processo: as acrescentadas pelo inspetor e, por segurança, qualquer fração
 * que já tenha fotos (para nunca ficarem fotos "escondidas"). Não há frações de origem.
 */
export function fractionsForProcess(extras: Fraction[], photos: PhotoRecord[]): Fraction[] {
  const out: Fraction[] = [];
  const seen = new Set<string>([COMMON_AREA.id]); // os espaços comuns não são uma fração da lista
  for (const f of extras) {
    if (seen.has(f.id)) continue;
    out.push(f);
    seen.add(f.id);
  }
  for (const p of photos) {
    if (!p.fractionId || seen.has(p.fractionId)) continue;
    out.push({ id: p.fractionId, name: p.fractionName ?? p.fractionId, folder: p.fractionFolder ?? p.fractionId });
    seen.add(p.fractionId);
  }
  return out;
}

/** A foto pertence a esta fração? (fractionId vazio/ausente = fotos sem fração) */
export function inFraction(photo: PhotoRecord, fractionId?: string): boolean {
  return (photo.fractionId ?? '') === (fractionId ?? '');
}
