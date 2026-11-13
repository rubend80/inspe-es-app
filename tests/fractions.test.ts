import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMMON_AREA, fractionsForProcess, inFraction, makeFraction, MAX_FRACTION_NAME, scopeOf } from '../src/fractions.ts';
import { makePhoto } from './helpers.ts';

describe('makeFraction', () => {
  it('cria id, nome e pasta a partir do que o inspetor escreve', () => {
    assert.deepEqual(makeFraction('fração a'), { id: 'fracao-a', name: 'Fração a', folder: 'Fração a' });
    assert.deepEqual(makeFraction('  1.º   Esq.  '), { id: '1-o-esq', name: '1.º Esq.', folder: '1.º Esq' });
  });

  it('tira os caracteres que o SharePoint não aceita da pasta', () => {
    const f = makeFraction('R/C: Dto?');
    assert.equal(f?.folder, 'R-C- Dto-');
    assert.ok(f?.id);
  });

  it('nome vazio ou só símbolos não serve', () => {
    assert.equal(makeFraction(''), undefined);
    assert.equal(makeFraction('   '), undefined);
    assert.equal(makeFraction('???'), undefined);
  });

  it('corta nomes muito compridos', () => {
    const f = makeFraction('x'.repeat(100));
    assert.equal(f?.name.length, MAX_FRACTION_NAME);
  });

  it('o mesmo nome dá sempre o mesmo id (não cria duplicados)', () => {
    assert.equal(makeFraction('Fração A')?.id, makeFraction('  fração  A ')?.id);
  });

  it('"Espaços comuns" não pode ser uma fração (já existe à parte)', () => {
    assert.equal(makeFraction('Espaços comuns'), undefined);
  });
});

describe('fractionsForProcess', () => {
  const a = { id: 'fracao-a', name: 'Fração A', folder: 'Fração A' };

  it('não há frações de origem', () => {
    assert.deepEqual(fractionsForProcess([], []), []);
  });

  it('mantém as acrescentadas, por ordem e sem repetir', () => {
    const b = { id: 'fracao-b', name: 'Fração B', folder: 'Fração B' };
    assert.deepEqual(fractionsForProcess([a, b, a], []), [a, b]);
  });

  it('uma fração que já tem fotos nunca desaparece', () => {
    const photo = makePhoto('p1', 1, { fractionId: 'fracao-c', fractionName: 'Fração C', fractionFolder: 'Fração C' });
    assert.deepEqual(fractionsForProcess([a], [photo]), [a, { id: 'fracao-c', name: 'Fração C', folder: 'Fração C' }]);
  });

  it('fotos sem fração não criam fração', () => {
    assert.deepEqual(fractionsForProcess([], [makePhoto('p1', 1)]), []);
  });
});

describe('inFraction', () => {
  it('compara a fração da foto; sem fração só bate com "sem fração"', () => {
    const semFracao = makePhoto('p1', 1);
    const naA = makePhoto('p2', 2, { fractionId: 'fracao-a' });
    assert.equal(inFraction(semFracao), true);
    assert.equal(inFraction(semFracao, ''), true);
    assert.equal(inFraction(semFracao, 'fracao-a'), false);
    assert.equal(inFraction(naA, 'fracao-a'), true);
    assert.equal(inFraction(naA), false);
  });
});

describe('espaços comuns', () => {
  it('têm pasta própria e usam a lista de divisões dos espaços comuns', () => {
    assert.deepEqual(COMMON_AREA, { id: 'espacos-comuns', name: 'Espaços comuns', folder: 'Espaços comuns' });
    assert.equal(scopeOf(COMMON_AREA), 'common');
    assert.equal(scopeOf(COMMON_AREA.id), 'common');
    assert.equal(scopeOf({ id: 'fracao-a', name: 'Fração A', folder: 'Fração A' }), 'unit');
    assert.equal(scopeOf(undefined), 'house');
  });

  it('não aparecem na lista das frações, mesmo com fotos', () => {
    const photo = makePhoto('p1', 1, { fractionId: COMMON_AREA.id, fractionName: COMMON_AREA.name, fractionFolder: COMMON_AREA.folder });
    assert.deepEqual(fractionsForProcess([], [photo]), []);
  });
});
