import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMMON_DIVISIONS,
  defaultDivisions,
  DIVISION_SUGGESTIONS,
  divisionsForProcess,
  makeDivision,
  nextDivision,
  UNIT_DIVISIONS,
} from '../src/divisions.ts';
import { makePhoto } from './helpers.ts';

describe('divisões de origem', () => {
  it('frações (e fração única): as pedidas, por esta ordem, com "IS" e sem garagem (só nos espaços comuns)', () => {
    assert.deepEqual(
      UNIT_DIVISIONS.map((d) => d.name),
      ['Hall', 'Sala', 'Cozinha', 'Quarto 1', 'Quarto 2', 'Quarto 3', 'Quarto 4', 'IS 1', 'IS 2', 'Arrumos', 'Sótão'],
    );
  });

  it('espaços comuns: fachada, cobertura, terraço e garagem', () => {
    assert.deepEqual(COMMON_DIVISIONS.map((d) => d.name), ['Fachada', 'Cobertura', 'Terraço', 'Garagem']);
    assert.equal(defaultDivisions('common'), COMMON_DIVISIONS);
    assert.equal(defaultDivisions('unit'), UNIT_DIVISIONS);
  });

  it('moradia: todas as divisões interiores e depois as exteriores', () => {
    assert.deepEqual(
      defaultDivisions('house').map((d) => d.name),
      ['Hall', 'Sala', 'Cozinha', 'Quarto 1', 'Quarto 2', 'Quarto 3', 'Quarto 4', 'IS 1', 'IS 2', 'Arrumos', 'Sótão', 'Fachada', 'Cobertura', 'Terraço', 'Garagem'],
    );
    assert.ok(DIVISION_SUGGESTIONS.house.includes('Logradouro'));
  });

  it('têm ids únicos e pastas com o nome da divisão', () => {
    for (const list of [UNIT_DIVISIONS, COMMON_DIVISIONS]) {
      assert.equal(new Set(list.map((d) => d.id)).size, list.length);
      for (const d of list) assert.equal(d.folder, d.name);
      for (const d of list) assert.equal(makeDivision(d.name)?.id, d.id, d.name);
    }
  });

  it('há sugestões para "outra divisão" nos dois casos', () => {
    assert.ok(DIVISION_SUGGESTIONS.unit.length > 3 && DIVISION_SUGGESTIONS.common.length > 3);
  });
});

describe('makeDivision', () => {
  it('arruma o nome e cria id e pasta', () => {
    assert.deepEqual(makeDivision('  varanda   norte '), { id: 'varanda-norte', name: 'Varanda norte', folder: 'Varanda norte' });
  });

  it('não aceita nomes vazios ou só com símbolos', () => {
    assert.equal(makeDivision('   '), undefined);
    assert.equal(makeDivision('///'), undefined);
  });

  it('dá a mesma divisão para "Quarto 1" e "quarto 1" (evita duplicados)', () => {
    assert.equal(makeDivision('quarto 1')?.id, UNIT_DIVISIONS.find((d) => d.name === 'Quarto 1')?.id);
  });
});

describe('divisionsForProcess', () => {
  it('espaços comuns usam a sua lista', () => {
    const list = divisionsForProcess([makeDivision('Escadas')!], [], 'common');
    assert.deepEqual(list.map((d) => d.name), ['Fachada', 'Cobertura', 'Terraço', 'Garagem', 'Escadas']);
  });

  it('junta as de origem e as acrescentadas, sem repetir', () => {
    const varanda = makeDivision('Varanda')!;
    const list = divisionsForProcess([varanda, makeDivision('Hall')!], []);
    assert.equal(list.length, UNIT_DIVISIONS.length + 1);
    assert.equal(list.at(-1)?.name, 'Varanda');
  });

  it('inclui divisões que já têm fotos mesmo que a lista tenha sido perdida', () => {
    const orfa = makePhoto('a', 1, { divisionId: 'varanda', divisionName: 'Varanda', divisionFolder: 'Varanda' });
    const list = divisionsForProcess([], [orfa, makePhoto('b', 2)]);
    assert.equal(list.at(-1)?.id, 'varanda');
    assert.equal(list.filter((d) => d.id === 'cozinha').length, 1);
  });
});

describe('nextDivision', () => {
  it('devolve a seguinte, e nada na última', () => {
    const list = [...UNIT_DIVISIONS];
    assert.equal(nextDivision(list, 'hall')?.id, 'sala');
    assert.equal(nextDivision(list, 'garagem'), undefined);
    assert.equal(nextDivision(list, 'não-existe'), undefined);
  });
});
