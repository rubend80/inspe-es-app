// Endereços da app (a parte depois do "#"). Assim o botão Voltar do Android funciona sem esforço:
//   #/                                  lista de processos
//   #/p/<processo>                      divisões do processo (sem fração)
//   #/p/<processo>/<divisão>            câmara dessa divisão
//   #/p/<processo>/f/<fração>           divisões de uma fração do processo
//   #/p/<processo>/f/<fração>/<divisão> câmara dessa divisão, nessa fração

export type Route =
  | { name: 'home' }
  | { name: 'process'; processId: string; fractionId?: string }
  | { name: 'division'; processId: string; divisionId: string; fractionId?: string };

export const homeHash = (): string => '#/';
export const processHash = (processId: string, fractionId?: string): string => {
  const base = `#/p/${encodeURIComponent(processId)}`;
  return fractionId ? `${base}/f/${encodeURIComponent(fractionId)}` : base;
};
export const divisionHash = (processId: string, divisionId: string, fractionId?: string): string =>
  `${processHash(processId, fractionId)}/${encodeURIComponent(divisionId)}`;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

export function parseRoute(hash: string): Route {
  // "/f/<fração>" tem sempre dois segmentos; uma divisão tem um só, por isso não se confundem.
  const m = hash.match(/^#\/p\/([^/]+)(?:\/f\/([^/]+))?(?:\/([^/]+))?\/?$/);
  const processId = m?.[1] ? safeDecode(m[1]) : '';
  if (!processId) return { name: 'home' };
  const fractionId = m?.[2] ? safeDecode(m[2]) : '';
  const divisionId = m?.[3] ? safeDecode(m[3]) : '';
  const fraction = fractionId ? { fractionId } : {};
  if (divisionId) return { name: 'division', processId, divisionId, ...fraction };
  return { name: 'process', processId, ...fraction };
}
