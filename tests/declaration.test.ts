import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { declarationFileName, declarationTokens, hourText, missingFields, placeAndDate, slashDate } from '../src/declaration.ts';
import type { DeclarationData } from '../src/declaration.ts';

const base: DeclarationData = {
  processId: '261068',
  name: 'Ana Exemplo',
  extra: '',
  capacity: 'proprietario',
  address: 'Rua Carlos Exemplo 12, Lisboa',
  date: '2026-11-17',
  start: '10:30',
  end: '11:45',
  place: 'Lisboa',
};

const plain = (d: DeclarationData): string =>
  declarationTokens(d)
    .map((t) => (t.kind === 'box' ? (t.checked ? '[X]' : '[ ]') : t.text))
    .join('');

describe('declaração de presença', () => {
  it('o texto fica igual ao modelo, já preenchido', () => {
    assert.equal(
      plain(base),
      'Declara-se, para os devidos efeitos, que o Exmo(a). Sr(a). Ana Exemplo, Representante[ ] Proprietário(a)[X] Inquilino(a)[ ] do imóvel sito na Rua Carlos Exemplo 12, Lisboa, esteve presente e acompanhou o técnico da LiveHouse – Inspecção de Edifícios e Consultoria, Lda, nas inspecções técnicas visuais realizadas no dia 17/11/2026 entre as 10h30m e as 11h45m, no âmbito do processo 261068-LIS serviço solicitado Inspeção e Diagnóstico.',
    );
  });

  it('o segundo campo só aparece se for preenchido', () => {
    assert.match(plain({ ...base, extra: 'em representação de X' }), /Ana Exemplo, em representação de X, Representante\[ \]/);
  });

  it('datas e horas como no papel', () => {
    assert.equal(slashDate('2026-11-17'), '17/11/2026');
    assert.equal(placeAndDate('Lisboa', '2026-11-17'), 'Lisboa, 17 de novembro de 2026');
    assert.equal(placeAndDate('', '2026-03-05'), 'Lisboa, 5 de março de 2026');
    assert.equal(hourText('09:05'), '09h05m');
  });

  it('nome do ficheiro', () => {
    assert.equal(declarationFileName(base), 'Declaração de Presença 261068 2026.11.17.pdf');
  });

  it('diz o que falta preencher', () => {
    assert.deepEqual(missingFields(base), []);
    assert.deepEqual(missingFields({ ...base, name: ' ', address: '' }), ['o nome de quem esteve presente', 'a morada do imóvel']);
    assert.deepEqual(missingFields({ ...base, end: '10:00' }), ['uma hora de fim depois da de início']);
  });
});
