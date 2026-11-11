import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_DIVISIONS, divisionsForProcess, makeDivision, nextDivision } from '../src/divisions.ts';
import { makePhoto } from './helpers.ts';

describe('divisões de origem', () => {
  it('são as pedidas, por esta ordem', () => {
    assert.deepEqual(
      DEFAULT_DIVISIONS.map((d) => d.name),
      [
        'Hall',
        'Sala',
        'Cozinha',
        'Quarto 1',
        'Quarto 2',
        'Quarto 3',
        'Casa de banho 1',
        'Casa de banho 2',
        'Garagem',
      ],
    );
  });

  it('têm ids únicos e pastas com o nome da divisão', () => {
    assert.equal(new Set(DEFAULT_DIVISIONS.map((d) => d.id)).size, DEFAULT_DIVISIONS.length);
    for (const d of DEFAULT_DIVISIONS) assert.equal(d.folder, d.name);
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
    assert.equal(makeDivision('quarto 1')?.id, DEFAULT_DIVISIONS.find((d) => d.name === 'Quarto 1')?.id);
  });
});

describe('divisionsForProcess', () => {
  it('junta as de origem e as acrescentadas, sem repetir', () => {
    const varanda = makeDivision('Varanda')!;
    const list = divisionsForProcess([varanda, makeDivision('Hall')!], []);
    assert.equal(list.length, DEFAULT_DIVISIONS.length + 1);
    assert.equal(list.at(-1)?.name, 'Varanda');
  });

  it('inclui divisões que já têm fotos mesmo que a lista tenha sido perdida', () => {
    const orfa = makePhoto('a', 1, { divisionId: 'sotao', divisionName: 'Sótão', divisionFolder: 'Sótão' });
    const list = divisionsForProcess([], [orfa, makePhoto('b', 2)]);
    assert.equal(list.at(-1)?.id, 'sotao');
    assert.equal(list.filter((d) => d.id === 'cozinha').length, 1);
  });
});

describe('nextDivision', () => {
  it('devolve a seguinte, e nada na última', () => {
    const list = [...DEFAULT_DIVISIONS];
    assert.equal(nextDivision(list, 'hall')?.id, 'sala');
    assert.equal(nextDivision(list, 'garagem'), undefined);
    assert.equal(nextDivision(list, 'não-existe'), undefined);
  });
});
