// Zoom da câmara. O Chrome do Android dá o zoom como um fator (1 = normal, 2 = o dobro, 0,5 = lente grande angular)
// e diz, por câmara, qual o intervalo que permite. A app só oferece os níveis que o telemóvel deixa usar.

export const ZOOM_LEVELS = [0.5, 1, 2] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export interface ZoomRange {
  min: number;
  max: number;
}

/** Margem para erros de arredondamento (alguns telemóveis dão 0,49 ou 2,0001). */
const TOLERANCE = 0.05;

/** Lê o intervalo de zoom das capacidades da câmara. null = a câmara não deixa mudar o zoom. */
export function zoomRangeOf(capabilities: unknown): ZoomRange | null {
  if (typeof capabilities !== 'object' || capabilities === null) return null;
  const zoom = (capabilities as { zoom?: unknown }).zoom;
  if (typeof zoom !== 'object' || zoom === null) return null;
  const { min, max } = zoom as { min?: unknown; max?: unknown };
  if (typeof min !== 'number' || typeof max !== 'number') return null;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return null;
  return { min, max };
}

/** Este nível pode ser usado? Sem zoom no telemóvel só o 1× (a imagem normal) existe. */
export function isZoomAvailable(level: ZoomLevel, range: ZoomRange | null): boolean {
  if (!range) return level === 1;
  return level >= range.min - TOLERANCE && level <= range.max + TOLERANCE;
}

/** O valor a pedir ao telemóvel: o nível, sem sair do intervalo. */
export function zoomValueFor(level: ZoomLevel, range: ZoomRange): number {
  return Math.min(range.max, Math.max(range.min, level));
}

/** O nível mais próximo de um zoom (para mostrar qual está ativo, em escala logarítmica: 0,5↔1↔2). */
export function nearestLevel(current: number): ZoomLevel {
  if (!Number.isFinite(current) || current <= 0) return 1;
  let best: ZoomLevel = 1;
  let bestDistance = Infinity;
  for (const level of ZOOM_LEVELS) {
    const distance = Math.abs(Math.log(current / level));
    if (distance < bestDistance) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}

/** "0,5×", "1×", "2×" (vírgula decimal, como se escreve em português). */
export function formatZoom(level: number): string {
  return `${String(level).replace('.', ',')}×`;
}

/** Texto para quando o inspetor toca num zoom que o telemóvel não deixa usar. */
export function unavailableMessage(level: ZoomLevel, range: ZoomRange | null): string {
  if (!range) return 'Este telemóvel não deixa a app mudar o zoom. Pode usar a câmara do sistema.';
  if (level < range.min) {
    return `O Chrome deste telemóvel não dá acesso ao zoom ${formatZoom(level)} (lente grande angular). Pode usar a câmara do sistema.`;
  }
  return `O zoom ${formatZoom(level)} não está disponível neste telemóvel.`;
}

/** Resumo para mostrar na câmara: o que o telemóvel permite. */
export function describeRange(range: ZoomRange | null): string {
  if (!range) return 'sem zoom';
  const fmt = (n: number): string => formatZoom(Math.round(n * 10) / 10);
  return `zoom ${fmt(range.min)} a ${fmt(range.max)}`;
}
