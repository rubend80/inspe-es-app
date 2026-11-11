import type { Process } from './types.ts';

/**
 * Os processos são pastas com o nome "<n.º> - <morada> - <cliente>", por exemplo
 * "260001 - Quinta da Fortaleza 86 Burgau Algarve - Edward Jackson".
 * O n.º tem 6 dígitos: ano (2) + sequência (4). A separação é feita por " - " (com espaços),
 * por isso hífenes dentro da morada ou do nome ("Rua A-B", "Maria José-Silva") não atrapalham.
 */
export interface ParsedProcessName {
  id: string;
  address: string;
  client?: string;
}

const SEPARATOR = /\s+[-–—]\s+/;

export function parseProcessFolderName(folderName: string): ParsedProcessName | undefined {
  const parts = folderName
    .trim()
    .split(SEPARATOR)
    .map((p) => p.trim());
  const id = parts[0] ?? '';
  if (!/^\d{4,8}$/.test(id)) return undefined; // não é uma pasta de processo (ex.: "Modelos", "Arquivo")
  if (parts.length === 1) return { id, address: '' };
  if (parts.length === 2) return { id, address: parts[1] ?? '' };
  return { id, address: parts.slice(1, -1).join(' - '), client: parts[parts.length - 1] };
}

/**
 * Cria o processo a partir do caminho da sua pasta, relativo à raiz dos processos
 * (ex.: "2026/01 Janeiro/260001 - Quinta da Fortaleza 86 Burgau Algarve - Edward Jackson").
 * Devolve undefined se a pasta não tiver o formato de um processo.
 */
export function processFromFolder(folderPath: string): Process | undefined {
  const folderName = folderPath.split('/').filter(Boolean).pop() ?? '';
  const parsed = parseProcessFolderName(folderName);
  if (!parsed) return undefined;
  const process: Process = { id: parsed.id, name: parsed.address || parsed.id, folder: folderPath };
  if (parsed.client) process.client = parsed.client;
  return process;
}

/** Mais recentes primeiro: o n.º começa pelo ano e sobe ao longo do ano. */
export function sortProcessesNewestFirst(list: readonly Process[]): Process[] {
  return [...list].sort((a, b) => b.id.localeCompare(a.id, 'pt', { numeric: true }));
}

/** Texto onde a pesquisa procura: n.º, morada e cliente, sem maiúsculas nem acentos. */
export function searchTextOf(p: Process): string {
  return `${p.id} ${p.name} ${p.client ?? ''}`
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

export function matchesQuery(p: Process, query: string): boolean {
  const terms = query
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;
  const text = searchTextOf(p);
  return terms.every((t) => text.includes(t));
}
