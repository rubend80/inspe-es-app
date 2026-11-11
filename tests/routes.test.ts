import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { divisionHash, parseRoute, processHash } from '../src/routes.ts';

describe('routes', () => {
  it('reconhece a lista, o processo e a divisão', () => {
    assert.deepEqual(parseRoute(''), { name: 'home' });
    assert.deepEqual(parseRoute('#/'), { name: 'home' });
    assert.deepEqual(parseRoute('#/p/2026-0142'), { name: 'process', processId: '2026-0142' });
    assert.deepEqual(parseRoute('#/p/2026-0142/cozinha'), {
      name: 'division',
      processId: '2026-0142',
      divisionId: 'cozinha',
    });
  });

  it('ida e volta com caracteres especiais', () => {
    const hash = divisionHash('RIC 18120/LIS', 'casa-de-banho-1');
    assert.deepEqual(parseRoute(hash), { name: 'division', processId: 'RIC 18120/LIS', divisionId: 'casa-de-banho-1' });
    assert.deepEqual(parseRoute(processHash('a b')), { name: 'process', processId: 'a b' });
  });

  it('com fração: processo e divisão dentro da fração', () => {
    assert.deepEqual(parseRoute('#/p/2026-0142/f/fracao-a'), { name: 'process', processId: '2026-0142', fractionId: 'fracao-a' });
    assert.deepEqual(parseRoute('#/p/2026-0142/f/fracao-a/cozinha'), {
      name: 'division',
      processId: '2026-0142',
      divisionId: 'cozinha',
      fractionId: 'fracao-a',
    });
  });

  it('ida e volta com fração e caracteres especiais', () => {
    const hash = divisionHash('RIC 18120/LIS', 'casa-de-banho-1', '1-o esq/dto');
    assert.deepEqual(parseRoute(hash), {
      name: 'division',
      processId: 'RIC 18120/LIS',
      divisionId: 'casa-de-banho-1',
      fractionId: '1-o esq/dto',
    });
    assert.deepEqual(parseRoute(processHash('a b', 'c d')), { name: 'process', processId: 'a b', fractionId: 'c d' });
  });

  it('sem fração os endereços são os de sempre', () => {
    assert.equal(processHash('260098'), '#/p/260098');
    assert.equal(divisionHash('260098', 'cozinha'), '#/p/260098/cozinha');
    assert.equal(processHash('260098', 'fracao-a'), '#/p/260098/f/fracao-a');
    assert.equal(divisionHash('260098', 'cozinha', 'fracao-a'), '#/p/260098/f/fracao-a/cozinha');
  });

  it('uma divisão chamada "f" não se confunde com o prefixo das frações', () => {
    assert.deepEqual(parseRoute('#/p/260098/f'), { name: 'division', processId: '260098', divisionId: 'f' });
    assert.deepEqual(parseRoute('#/p/260098/f/fracao-a/f'), {
      name: 'division',
      processId: '260098',
      divisionId: 'f',
      fractionId: 'fracao-a',
    });
  });

  it('endereços estranhos voltam à lista ou ao processo', () => {
    assert.deepEqual(parseRoute('#/qualquer-coisa'), { name: 'home' });
    assert.deepEqual(parseRoute('#/p/%E0%A4%A'), { name: 'home' });
    assert.deepEqual(parseRoute('#/p/abc/%E0%A4%A'), { name: 'process', processId: 'abc' });
  });
});
