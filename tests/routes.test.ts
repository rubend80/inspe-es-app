import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { divisionHash, divisionsHash, fractionsHash, parseRoute, processHash } from '../src/routes.ts';

describe('routes', () => {
  it('lista, processo, frações', () => {
    assert.deepEqual(parseRoute(''), { name: 'home' });
    assert.deepEqual(parseRoute('#/'), { name: 'home' });
    assert.deepEqual(parseRoute('#/p/260098'), { name: 'process', processId: '260098' });
    assert.deepEqual(parseRoute('#/p/260098/fracoes'), { name: 'fractions', processId: '260098' });
  });

  it('fração única: divisões e câmara', () => {
    assert.deepEqual(parseRoute('#/p/260098/u'), { name: 'divisions', processId: '260098' });
    assert.deepEqual(parseRoute('#/p/260098/u/cozinha'), { name: 'division', processId: '260098', divisionId: 'cozinha' });
  });

  it('fração (ou espaços comuns): divisões e câmara', () => {
    assert.deepEqual(parseRoute('#/p/260098/f/fracao-a'), { name: 'divisions', processId: '260098', fractionId: 'fracao-a' });
    assert.deepEqual(parseRoute('#/p/260098/f/espacos-comuns/fachada'), {
      name: 'division',
      processId: '260098',
      divisionId: 'fachada',
      fractionId: 'espacos-comuns',
    });
  });

  it('os endereços criados voltam a ser lidos igual (com caracteres especiais)', () => {
    assert.equal(processHash('260098'), '#/p/260098');
    assert.equal(fractionsHash('260098'), '#/p/260098/fracoes');
    assert.equal(divisionsHash('260098'), '#/p/260098/u');
    assert.equal(divisionsHash('260098', 'fracao-a'), '#/p/260098/f/fracao-a');
    assert.equal(divisionHash('260098', 'ic-1'), '#/p/260098/u/ic-1');
    assert.deepEqual(parseRoute(divisionHash('A/B 1', 'ic-1', '1.º Esq/Dto')), {
      name: 'division',
      processId: 'A/B 1',
      divisionId: 'ic-1',
      fractionId: '1.º Esq/Dto',
    });
  });

  it('endereço antigo #/p/<processo>/<divisão> = fração única', () => {
    assert.deepEqual(parseRoute('#/p/260098/cozinha'), { name: 'division', processId: '260098', divisionId: 'cozinha' });
  });

  it('endereços estranhos voltam à lista ou ao processo', () => {
    assert.deepEqual(parseRoute('#/qualquer-coisa'), { name: 'home' });
    assert.deepEqual(parseRoute('#/p/%E0%A4%A'), { name: 'home' });
    assert.deepEqual(parseRoute('#/p/abc/%E0%A4%A'), { name: 'process', processId: 'abc' });
    assert.deepEqual(parseRoute('#/p/abc/x/y/z/w'), { name: 'process', processId: 'abc' });
  });
});
