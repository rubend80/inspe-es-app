import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jpegToPdf } from '../src/pdf.ts';

describe('jpegToPdf', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 0xff, 0xd9]);
  const pdf = jpegToPdf(jpeg, 1654, 2339);
  const text = Buffer.from(pdf).toString('latin1');

  it('é um PDF A4 com uma página e a imagem', () => {
    assert.ok(text.startsWith('%PDF-1.4'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    assert.match(text, /\/MediaBox \[0 0 595.28 841.89\]/);
    assert.match(text, /\/Width 1654 \/Height 2339/);
    assert.match(text, /\/Filter \/DCTDecode \/Length 8 /);
  });

  it('a tabela xref aponta para o início de cada objeto', () => {
    const xrefAt = Number(text.match(/startxref\n(\d+)/)![1]);
    assert.ok(text.slice(xrefAt).startsWith('xref'));
    const entries = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    assert.equal(entries.length, 5);
    entries.forEach((off, i) => assert.ok(text.slice(off).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1}`));
  });

  it('a imagem vai tal e qual', () => {
    const at = text.indexOf('stream\n', text.indexOf('4 0 obj')) + 'stream\n'.length;
    assert.deepEqual([...pdf.slice(at, at + jpeg.length)], [...jpeg]);
  });
});
