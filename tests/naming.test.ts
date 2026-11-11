import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPhotoFileName,
  dayKey,
  extFromMime,
  fitWithin,
  folderNameFor,
  LIGHT_BOX_LONG,
  LIGHT_BOX_SHORT,
  LIGHT_JPEG_QUALITY,
  LIGHT_SUBFOLDER,
  lightFileNameFor,
  PHOTOS_SUBFOLDER,
  remoteFolderFor,
  remoteLightFolderFor,
  remotePathFor,
  slugify,
  timeKey,
} from '../src/naming.ts';

describe('slugify', () => {
  it('tira acentos, espaços e símbolos', () => {
    assert.equal(slugify('Cozinha / Sala 2º'), 'cozinha-sala-2o');
    assert.equal(slugify('  Casa de Banho (WC)  '), 'casa-de-banho-wc');
    assert.equal(slugify('Cobertura – Açoteia'), 'cobertura-acoteia');
  });

  it('respeita o tamanho máximo sem deixar "-" no fim', () => {
    const s = slugify('aaaa bbbb cccc dddd', 9);
    assert.equal(s, 'aaaa-bbbb');
  });

  it('devolve vazio quando não sobra nada', () => {
    assert.equal(slugify('///'), '');
  });
});

describe('folderNameFor', () => {
  it('mantém nomes legíveis, com espaços e acentos', () => {
    assert.equal(folderNameFor('Casa de banho 1'), 'Casa de banho 1');
    assert.equal(folderNameFor('Arrecadação'), 'Arrecadação');
    assert.equal(folderNameFor('  Hall  '), 'Hall');
  });

  it('tira o que o SharePoint não aceita e pontos no fim', () => {
    assert.doesNotMatch(folderNameFor('Sala/Jantar: "grande" <1>?'), /["*:<>?/\\|]/);
    assert.equal(folderNameFor('Quarto 1.'), 'Quarto 1');
  });
});

describe('datas', () => {
  const d = new Date(2026, 10, 3, 9, 5, 7); // 3 nov 2026, 09:05:07 (hora local)
  it('dayKey e timeKey usam zeros à esquerda', () => {
    assert.equal(dayKey(d), '20261103');
    assert.equal(timeKey(d), '090507');
  });
});

describe('buildPhotoFileName', () => {
  const takenAt = new Date(2026, 10, 3, 14, 30, 15);

  it('segue a convenção processo_data_hora_ordem_divisão', () => {
    const name = buildPhotoFileName({ processId: '260098', takenAt, seq: 7, division: 'Cozinha' });
    assert.equal(name, '260098_20261103_143015_007_cozinha.jpg');
  });

  it('usa o nome da divisão, sem acentos nem espaços', () => {
    const name = buildPhotoFileName({ processId: '2026-0142', takenAt, seq: 1, division: 'Casa de banho 1' });
    assert.equal(name, '2026-0142_20261103_143015_001_casa-de-banho-1.jpg');
  });

  it('omite a divisão quando não há', () => {
    const name = buildPhotoFileName({ processId: '2026-0142', takenAt, seq: 12 });
    assert.equal(name, '2026-0142_20261103_143015_012.jpg');
  });

  it('usa a extensão certa para o tipo de imagem', () => {
    assert.equal(extFromMime('image/png'), 'png');
    assert.equal(extFromMime('image/jpeg'), 'jpg');
    assert.equal(extFromMime('qualquer/coisa'), 'jpg');
    const name = buildPhotoFileName({ processId: 'P1', takenAt, seq: 1, mimeType: 'image/webp' });
    assert.ok(name.endsWith('.webp'));
  });

  it('nunca produz caracteres proibidos no SharePoint', () => {
    const name = buildPhotoFileName({ processId: 'A/B:C*D', takenAt, seq: 1, division: 'Sala "grande" <1>' });
    assert.doesNotMatch(name, /["*:<>?/\\|]/);
  });
});

describe('nome do ficheiro com fração', () => {
  const takenAt = new Date(2026, 10, 3, 14, 30, 15);

  it('a fração vem antes da divisão', () => {
    const name = buildPhotoFileName({ processId: '260098', takenAt, seq: 8, division: 'Cozinha', fraction: 'Fração A' });
    assert.equal(name, '260098_20261103_143015_008_fracao-a_cozinha.jpg');
  });

  it('com nomes como "1.º Esq."', () => {
    const name = buildPhotoFileName({ processId: '260098', takenAt, seq: 1, division: 'Sala', fraction: '1.º Esq.' });
    assert.equal(name, '260098_20261103_143015_001_1-o-esq_sala.jpg');
  });

  it('sem fração o nome é o de sempre', () => {
    assert.equal(buildPhotoFileName({ processId: '260098', takenAt, seq: 7, division: 'Cozinha' }), '260098_20261103_143015_007_cozinha.jpg');
  });
});

describe('fitWithin (versão leve: Image Resizer, Personalizado, Ajustar, 2500 × 1875)', () => {
  const light = (w: number, h: number) => fitWithin(w, h, LIGHT_BOX_LONG, LIGHT_BOX_SHORT);

  it('a caixa é 2500 × 1875, com qualidade 90', () => {
    assert.equal(LIGHT_BOX_LONG, 2500);
    assert.equal(LIGHT_BOX_SHORT, 1875);
    assert.equal(LIGHT_JPEG_QUALITY, 0.9);
  });

  it('foto deitada 4:3 de telemóvel fica 2500 × 1875', () => {
    assert.deepEqual(light(4000, 3000), { width: 2500, height: 1875 });
    assert.deepEqual(light(4032, 3024), { width: 2500, height: 1875 });
    assert.deepEqual(light(4624, 3468), { width: 2500, height: 1875 });
  });

  it('foto em pé: a caixa roda (1875 × 2500)', () => {
    assert.deepEqual(light(3000, 4000), { width: 1875, height: 2500 });
    assert.deepEqual(light(3024, 4032), { width: 1875, height: 2500 });
  });

  it('mantém as proporções, sem cortar (16:9, 3:2, quadrada)', () => {
    assert.deepEqual(light(4000, 2250), { width: 2500, height: 1406 });
    assert.deepEqual(light(6000, 4000), { width: 2500, height: 1667 });
    assert.deepEqual(light(3000, 3000), { width: 1875, height: 1875 });
    assert.deepEqual(light(2250, 4000), { width: 1406, height: 2500 }, 'em pé 9:16: limitada pela altura (2500)');
  });

  it('nunca aumenta uma foto mais pequena', () => {
    assert.deepEqual(light(800, 600), { width: 800, height: 600 });
    assert.deepEqual(light(1920, 1080), { width: 1920, height: 1080 });
    assert.deepEqual(light(2500, 1875), { width: 2500, height: 1875 });
  });

  it('uma foto só um pouco maior também é reduzida', () => {
    assert.deepEqual(light(2600, 1950), { width: 2500, height: 1875 });
    assert.deepEqual(light(2600, 1000), { width: 2500, height: 962 });
  });

  it('com caixa quadrada serve para as miniaturas (lado maior)', () => {
    assert.deepEqual(fitWithin(4000, 3000, 360, 360), { width: 360, height: 270 });
    assert.deepEqual(fitWithin(3000, 4000, 360, 360), { width: 270, height: 360 });
    assert.deepEqual(fitWithin(100, 50, 360, 360), { width: 100, height: 50 });
  });

  it('medidas inválidas não rebentam', () => {
    assert.deepEqual(light(0, 0), { width: 0, height: 0 });
    assert.deepEqual(light(NaN, 100), { width: NaN, height: 100 });
  });
});

describe('pastas de destino', () => {
  const processo = '2026/02 Fevereiro/260098 - Praça de Portugal 7 Odivelas - Ana Exemplo';

  it('as fotos ficam na pasta "2. Fotos" do processo, dentro da pasta da divisão', () => {
    assert.equal(PHOTOS_SUBFOLDER, '2. Fotos');
    assert.equal(remoteFolderFor(processo, 'Cozinha'), `${processo}/2. Fotos/Cozinha`);
  });

  it('a versão leve vai para "3. Fotos - Light", com a mesma divisão', () => {
    assert.equal(LIGHT_SUBFOLDER, '3. Fotos - Light');
    assert.equal(remoteLightFolderFor(processo, 'Cozinha'), `${processo}/3. Fotos - Light/Cozinha`);
    assert.equal(remoteLightFolderFor(processo), `${processo}/3. Fotos - Light`);
  });

  it('o original nunca vai para a pasta Light', () => {
    assert.doesNotMatch(remoteFolderFor(processo, 'Cozinha'), /Light/);
  });

  it('a versão leve é sempre JPEG, com o mesmo nome', () => {
    assert.equal(lightFileNameFor('260098_20261103_143015_007_cozinha.jpg'), '260098_20261103_143015_007_cozinha.jpg');
    assert.equal(lightFileNameFor('260098_20261103_143015_007_cozinha.png'), '260098_20261103_143015_007_cozinha.jpg');
    assert.equal(lightFileNameFor('sem-extensao'), 'sem-extensao.jpg');
  });

  it('com fração: a pasta da fração fica entre "2. Fotos" e a divisão (original e leve)', () => {
    assert.equal(remoteFolderFor(processo, 'Cozinha', 'Fração A'), `${processo}/2. Fotos/Fração A/Cozinha`);
    assert.equal(remoteLightFolderFor(processo, 'Cozinha', 'Fração A'), `${processo}/3. Fotos - Light/Fração A/Cozinha`);
  });

  it('sem fração (ou fração vazia) nada muda', () => {
    assert.equal(remoteFolderFor(processo, 'Cozinha', undefined), `${processo}/2. Fotos/Cozinha`);
    assert.equal(remoteFolderFor(processo, 'Cozinha', ''), `${processo}/2. Fotos/Cozinha`);
  });

  it('sem divisão fica na pasta das fotos', () => {
    assert.equal(remoteFolderFor(processo), `${processo}/2. Fotos`);
  });

  it('o caminho final junta a pasta e o nome', () => {
    assert.equal(remotePathFor('A/B', 'x.jpg'), 'A/B/x.jpg');
  });
});
