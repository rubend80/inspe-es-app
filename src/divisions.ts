import { folderNameFor, slugify } from './naming.ts';
import type { Division, PhotoRecord } from './types.ts';

/** "unit" = divisões de uma fração; "common" = espaços comuns do prédio; "house" = moradia (interiores e exteriores). */
export type DivisionScope = 'unit' | 'common' | 'house';

const d = (name: string, id: string): Division => ({ id, name, folder: name });

/** Divisões de cada fração , por esta ordem (a moradia junta-lhes as exteriores). */
export const UNIT_DIVISIONS: readonly Division[] = [
  d('Hall', 'hall'),
  d('Sala', 'sala'),
  d('Cozinha', 'cozinha'),
  d('Quarto 1', 'quarto-1'),
  d('Quarto 2', 'quarto-2'),
  d('Quarto 3', 'quarto-3'),
  d('Quarto 4', 'quarto-4'),
  d('IS 1', 'is-1'),
  d('IS 2', 'is-2'),
  d('Arrumos', 'arrumos'),
  d('Sótão', 'sotao'),
];

/** Divisões dos espaços comuns. */
export const COMMON_DIVISIONS: readonly Division[] = [
  d('Fachada', 'fachada'),
  d('Cobertura', 'cobertura'),
  d('Terraço', 'terraco'),
  d('Garagem', 'garagem'),
];

/** Moradia: primeiro as divisões interiores, depois as exteriores. */
export const HOUSE_DIVISIONS: readonly Division[] = [...UNIT_DIVISIONS, ...COMMON_DIVISIONS];

export const defaultDivisions = (scope: DivisionScope): readonly Division[] =>
  scope === 'common' ? COMMON_DIVISIONS : scope === 'house' ? HOUSE_DIVISIONS : UNIT_DIVISIONS;

/** Sugestões ao acrescentar uma divisão que não está na lista. */
export const DIVISION_SUGGESTIONS: Record<DivisionScope, string[]> = {
  unit: ['Quarto 5', 'IS 3', 'Varanda', 'Corredor', 'Despensa', 'Lavandaria', 'Escritório', 'Marquise', 'Cave', 'Quintal'],
  common: ['Escadas', 'Hall de entrada', 'Elevador', 'Logradouro', 'Arrecadações', 'Cave', 'Empenas', 'Caixa de escadas'],
  house: ['Quarto 5', 'IS 3', 'Varanda', 'Corredor', 'Despensa', 'Lavandaria', 'Escritório', 'Cave', 'Logradouro', 'Quintal', 'Jardim', 'Anexo', 'Muros'],
};

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
 * Divisões de um processo (de um tipo): as de origem, as acrescentadas pelo inspetor e, por segurança,
 * qualquer divisão que já tenha fotos desse tipo (para nunca ficarem fotos "escondidas").
 */
export function divisionsForProcess(extras: Division[], photos: PhotoRecord[], scope: DivisionScope = 'unit'): Division[] {
  const out: Division[] = [...defaultDivisions(scope)];
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
