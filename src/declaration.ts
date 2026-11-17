// Declaração de presença (modelo da LiveHouse): dados e texto, sem nada de ecrã.

export const OTHER_DATA_SUBFOLDER = '7. Outros Dados';
export const PROCESS_SUFFIX = '-LIS';

export type Capacity = 'representante' | 'proprietario' | 'inquilino';

export const CAPACITY_LABEL: Record<Capacity, string> = {
  representante: 'Representante',
  proprietario: 'Proprietário(a)',
  inquilino: 'Inquilino(a)',
};

export interface DeclarationData {
  processId: string;
  name: string;
  /** O segundo espaço do modelo, a seguir ao nome (opcional). */
  extra: string;
  capacity: Capacity;
  address: string;
  /** dia da inspeção, "AAAA-MM-DD" */
  date: string;
  /** "HH:MM" */
  start: string;
  end: string;
  place: string;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad = (n: number): string => String(n).padStart(2, '0');

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? 0, m ?? 1, d ?? 1];
}

/** "17/11/2026" */
export function slashDate(date: string): string {
  const [y, m, d] = parts(date);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** "Lisboa, 17 de novembro de 2026" */
export function placeAndDate(place: string, date: string): string {
  const [y, m, d] = parts(date);
  return `${place || 'Lisboa'}, ${d} de ${MONTHS[m - 1] ?? ''} de ${y}`;
}

/** "10h30m" */
export function hourText(time: string): string {
  const [h, m] = time.split(':');
  return `${h ?? '00'}h${m ?? '00'}m`;
}

/** O que falta preencher (mensagens para o ecrã). Vazio = pronta para assinar. */
export function missingFields(d: DeclarationData): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push('o nome de quem esteve presente');
  if (!d.address.trim()) out.push('a morada do imóvel');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) out.push('a data');
  if (!/^\d{2}:\d{2}$/.test(d.start)) out.push('a hora de início');
  if (!/^\d{2}:\d{2}$/.test(d.end)) out.push('a hora de fim');
  if (/^\d{2}:\d{2}$/.test(d.start) && /^\d{2}:\d{2}$/.test(d.end) && d.end <= d.start) out.push('uma hora de fim depois da de início');
  return out;
}

/** Pedaço do parágrafo: texto normal, valor preenchido (a negrito) ou quadrado de escolha. */
export type Token = { kind: 'text'; text: string } | { kind: 'value'; text: string } | { kind: 'box'; checked: boolean };

/** O parágrafo da declaração, já preenchido, em pedaços (para desenhar e quebrar linhas). */
export function declarationTokens(d: DeclarationData): Token[] {
  const t = (text: string): Token => ({ kind: 'text', text });
  const v = (text: string): Token => ({ kind: 'value', text: text.trim() });
  // Como no modelo: o nome da opção e depois o quadrado ("Representante ☐").
  const box = (c: Capacity): Token[] => [t(CAPACITY_LABEL[c]), { kind: 'box', checked: d.capacity === c }];
  return [
    t('Declara-se, para os devidos efeitos, que o Exmo(a). Sr(a). '),
    v(d.name),
    t(', '),
    ...(d.extra.trim() ? [v(d.extra), t(', ')] : []),
    ...box('representante'),
    t(' '),
    ...box('proprietario'),
    t(' '),
    ...box('inquilino'),
    t(' do imóvel sito na '),
    v(d.address),
    t(', esteve presente e acompanhou o técnico da LiveHouse – Inspecção de Edifícios e Consultoria, Lda, nas inspecções técnicas visuais realizadas no dia '),
    v(slashDate(d.date)),
    t(' entre as '),
    v(hourText(d.start)),
    t(' e as '),
    v(hourText(d.end)),
    t(', no âmbito do processo '),
    v(`${d.processId}${PROCESS_SUFFIX}`),
    t(' serviço solicitado Inspeção e Diagnóstico.'),
  ];
}

/** "Declaração de Presença 261068 2026.11.17.pdf" */
export function declarationFileName(d: DeclarationData): string {
  const [y, m, day] = parts(d.date);
  return `Declaração de Presença ${d.processId} ${y}.${pad(m)}.${pad(day)}.pdf`;
}
