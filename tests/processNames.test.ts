import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchesQuery,
  parseProcessFolderName,
  processFromFolder,
  sortProcessesNewestFirst,
} from '../src/processNames.ts';
import type { Process } from '../src/types.ts';

describe('parseProcessFolderName', () => {
  it('separa n.º, morada e cliente', () => {
    assert.deepEqual(parseProcessFolderName('260098 - Praça de Portugal 7 Odivelas - Ana Exemplo'), {
      id: '260098',
      address: 'Praça de Portugal 7 Odivelas',
      client: 'Ana Exemplo',
    });
  });

  it('hífenes sem espaços fazem parte do texto', () => {
    const p = parseProcessFolderName('260010 - Rua Alves-Redol 5 Lisboa - Maria José-Silva');
    assert.equal(p?.address, 'Rua Alves-Redol 5 Lisboa');
    assert.equal(p?.client, 'Maria José-Silva');
  });

  it('aceita " – " (travessão) como separador', () => {
    assert.equal(parseProcessFolderName('260011 – Rua A 1 – Rui')?.client, 'Rui');
  });

  it('sem cliente: só n.º e morada', () => {
    assert.deepEqual(parseProcessFolderName('260012 - Rua B 2 Porto'), { id: '260012', address: 'Rua B 2 Porto' });
  });

  it('só o n.º', () => {
    assert.deepEqual(parseProcessFolderName('260013'), { id: '260013', address: '' });
  });

  it('morada com " - " a meio e cliente no fim', () => {
    const p = parseProcessFolderName('260014 - Bloco A - 3.º Dto - Rui Teste');
    assert.equal(p?.address, 'Bloco A - 3.º Dto');
    assert.equal(p?.client, 'Rui Teste');
  });

  it('pastas que não são processos são ignoradas', () => {
    assert.equal(parseProcessFolderName('Modelos'), undefined);
    assert.equal(parseProcessFolderName('Arquivo - 2025'), undefined);
    assert.equal(parseProcessFolderName(''), undefined);
  });
});

describe('processFromFolder', () => {
  it('usa o último nome do caminho e guarda o caminho todo', () => {
    const p = processFromFolder('2026/02 Fevereiro/260098 - Praça de Portugal 7 Odivelas - Ana Exemplo');
    assert.equal(p?.id, '260098');
    assert.equal(p?.name, 'Praça de Portugal 7 Odivelas');
    assert.equal(p?.client, 'Ana Exemplo');
    assert.equal(p?.folder, '2026/02 Fevereiro/260098 - Praça de Portugal 7 Odivelas - Ana Exemplo');
  });

  it('sem morada mostra o n.º', () => {
    assert.equal(processFromFolder('2026/01 Janeiro/260001')?.name, '260001');
  });

  it('pasta de outro tipo dá undefined', () => {
    assert.equal(processFromFolder('2026/01 Janeiro/Sem processo'), undefined);
  });
});

describe('lista de processos', () => {
  const mk = (id: string, name: string, client?: string): Process => ({ id, name, client, folder: id });
  const list = [
    mk('260003', 'Escola Básica n.º 3 Amadora', 'Município Demo'),
    mk('260142', 'Moradia Rua das Flores 12 Lisboa', 'Ana Exemplo'),
    mk('260098', 'Praça de Portugal 7 Odivelas', 'Ana Mafalda'),
  ];

  it('mais recentes primeiro', () => {
    assert.deepEqual(sortProcessesNewestFirst(list).map((p) => p.id), ['260142', '260098', '260003']);
  });

  it('pesquisa por n.º, morada ou cliente, sem acentos nem maiúsculas', () => {
    assert.ok(matchesQuery(list[0]!, '260003'));
    assert.ok(matchesQuery(list[0]!, 'BASICA amadora'));
    assert.ok(matchesQuery(list[1]!, 'ana exemplo'));
    assert.ok(matchesQuery(list[2]!, 'praca portugal'));
    assert.ok(!matchesQuery(list[2]!, 'flores'));
    assert.ok(matchesQuery(list[2]!, '   '), 'pesquisa vazia mostra tudo');
  });

  it('todas as palavras têm de existir', () => {
    assert.deepEqual(list.filter((p) => matchesQuery(p, 'ana flores')).map((p) => p.id), ['260142']);
  });
});
