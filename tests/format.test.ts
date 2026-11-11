import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPhotoCount, formatResolution, formatSize } from '../src/format.ts';

describe('formatResolution', () => {
  it('mostra píxeis e megapíxeis com vírgula', () => {
    assert.equal(formatResolution(4032, 3024), '4032 × 3024 px · 12,2 MP');
    assert.equal(formatResolution(1920, 1080), '1920 × 1080 px · 2,1 MP');
    assert.equal(formatResolution(640, 480), '640 × 480 px · 0,3 MP');
  });
});

describe('formatSize / formatPhotoCount', () => {
  it('tamanhos e contagens', () => {
    assert.equal(formatSize(500), '1 KB');
    assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB');
    assert.equal(formatPhotoCount(0), 'Sem fotos');
    assert.equal(formatPhotoCount(1), '1 foto');
    assert.equal(formatPhotoCount(3), '3 fotos');
  });
});
