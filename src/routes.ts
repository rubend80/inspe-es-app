// Endereços da app (a parte depois do "#"). Assim o botão Voltar do Android funciona sem esforço:
//   #/                                   lista de processos
//   #/p/<processo>                       processo: Espaços comuns, Frações, Moradia
//   #/p/<processo>/fracoes               lista das frações
//   #/p/<processo>/f/<fração>            divisões de uma fração (ou dos espaços comuns)
//   #/p/<processo>/f/<fração>/<divisão>  câmara dessa divisão
//   #/p/<processo>/u                     divisões da moradia
//   #/p/<processo>/u/<divisão>           câmara dessa divisão

export type Route =
  | { name: 'home' }
  | { name: 'process'; processId: string }
  | { name: 'fractions'; processId: string }
  /** fractionId ausente = moradia */
  | { name: 'divisions'; processId: string; fractionId?: string }
  | { name: 'division'; processId: string; divisionId: string; fractionId?: string };

const enc = encodeURIComponent;
export const homeHash = (): string => '#/';
export const processHash = (processId: string): string => `#/p/${enc(processId)}`;
export const fractionsHash = (processId: string): string => `${processHash(processId)}/fracoes`;
export const divisionsHash = (processId: string, fractionId?: string): string =>
  fractionId ? `${processHash(processId)}/f/${enc(fractionId)}` : `${processHash(processId)}/u`;
export const divisionHash = (processId: string, divisionId: string, fractionId?: string): string =>
  `${divisionsHash(processId, fractionId)}/${enc(divisionId)}`;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

export function parseRoute(hash: string): Route {
  const m = hash.match(/^#\/p\/([^/]+)((?:\/[^/]+)*)\/?$/);
  const processId = m?.[1] ? safeDecode(m[1]) : '';
  if (!processId) return { name: 'home' };
  const rest = (m?.[2] ?? '').split('/').filter(Boolean).map(safeDecode);
  if (rest.some((s) => s === '')) return { name: 'process', processId };
  const [a, b, c] = rest;
  if (rest.length === 0) return { name: 'process', processId };
  if (rest.length === 1 && a === 'fracoes') return { name: 'fractions', processId };
  if (a === 'u' && rest.length === 1) return { name: 'divisions', processId };
  if (a === 'u' && rest.length === 2 && b) return { name: 'division', processId, divisionId: b };
  if (a === 'f' && rest.length === 2 && b) return { name: 'divisions', processId, fractionId: b };
  if (a === 'f' && rest.length === 3 && b && c) return { name: 'division', processId, divisionId: c, fractionId: b };
  // endereço antigo #/p/<processo>/<divisão> = moradia
  if (rest.length === 1 && a) return { name: 'division', processId, divisionId: a };
  return { name: 'process', processId };
}
