import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describeRange,
  formatZoom,
  isZoomAvailable,
  nearestLevel,
  unavailableMessage,
  ZOOM_LEVELS,
  zoomRangeOf,
  zoomValueFor,
} from '../src/zoom.ts';

describe('zoomRangeOf', () => {
  it('lê o intervalo das capacidades da câmara', () => {
    assert.deepEqual(zoomRangeOf({ zoom: { min: 0.5, max: 10, step: 0.1 } }), { min: 0.5, max: 10 });
  });

  it('sem zoom, ou com valores estranhos, não há intervalo', () => {
    assert.equal(zoomRangeOf({}), null);
    assert.equal(zoomRangeOf(null), null);
    assert.equal(zoomRangeOf(undefined), null);
    assert.equal(zoomRangeOf({ zoom: 3 }), null);
    assert.equal(zoomRangeOf({ zoom: { min: 'a', max: 2 } }), null);
    assert.equal(zoomRangeOf({ zoom: { min: 2, max: 1 } }), null);
    assert.equal(zoomRangeOf({ zoom: { min: 0, max: 4 } }), null);
    assert.equal(zoomRangeOf({ zoom: { min: 1, max: Infinity } }), null);
  });
});

describe('isZoomAvailable', () => {
  it('telemóvel com grande angular: os três níveis', () => {
    const range = { min: 0.5, max: 8 };
    assert.deepEqual(ZOOM_LEVELS.map((l) => isZoomAvailable(l, range)), [true, true, true]);
  });

  it('telemóvel normal (1× a 8×): só 1× e 2×', () => {
    const range = { min: 1, max: 8 };
    assert.deepEqual(ZOOM_LEVELS.map((l) => isZoomAvailable(l, range)), [false, true, true]);
  });

  it('zoom até 1,5×: 2× não está', () => {
    assert.deepEqual(ZOOM_LEVELS.map((l) => isZoomAvailable(l, { min: 1, max: 1.5 })), [false, true, false]);
  });

  it('aguenta arredondamentos (0,49 e 2,0001)', () => {
    assert.equal(isZoomAvailable(0.5, { min: 0.49, max: 5 }), true);
    assert.equal(isZoomAvailable(2, { min: 1, max: 1.99 }), true);
    assert.equal(isZoomAvailable(0.5, { min: 0.6, max: 5 }), false);
  });

  it('sem zoom no telemóvel só existe o 1×', () => {
    assert.deepEqual(ZOOM_LEVELS.map((l) => isZoomAvailable(l, null)), [false, true, false]);
  });
});

describe('zoomValueFor', () => {
  it('não sai do intervalo do telemóvel', () => {
    assert.equal(zoomValueFor(0.5, { min: 0.49, max: 5 }), 0.5);
    assert.equal(zoomValueFor(0.5, { min: 0.52, max: 5 }), 0.52);
    assert.equal(zoomValueFor(2, { min: 1, max: 1.99 }), 1.99);
    assert.equal(zoomValueFor(1, { min: 1, max: 8 }), 1);
  });
});

describe('nearestLevel', () => {
  it('diz qual dos três níveis está ativo', () => {
    assert.equal(nearestLevel(0.5), 0.5);
    assert.equal(nearestLevel(0.6), 0.5);
    assert.equal(nearestLevel(1), 1);
    assert.equal(nearestLevel(1.2), 1);
    assert.equal(nearestLevel(1.9), 2);
    assert.equal(nearestLevel(2), 2);
    assert.equal(nearestLevel(7), 2);
  });

  it('valores inválidos dão 1×', () => {
    assert.equal(nearestLevel(NaN), 1);
    assert.equal(nearestLevel(0), 1);
    assert.equal(nearestLevel(-3), 1);
  });
});

describe('textos', () => {
  it('formatam com vírgula decimal', () => {
    assert.equal(formatZoom(0.5), '0,5×');
    assert.equal(formatZoom(1), '1×');
    assert.equal(formatZoom(2), '2×');
  });

  it('explicam porque um zoom não está disponível', () => {
    assert.match(unavailableMessage(0.5, { min: 1, max: 8 }), /0,5×.*grande angular/);
    assert.match(unavailableMessage(2, { min: 1, max: 1.5 }), /2×.*não está disponível/);
    assert.match(unavailableMessage(2, null), /não deixa a app mudar o zoom/);
  });

  it('resumem o intervalo', () => {
    assert.equal(describeRange({ min: 0.5, max: 10 }), 'zoom 0,5× a 10×');
    assert.equal(describeRange({ min: 1, max: 7.96 }), 'zoom 1× a 8×');
    assert.equal(describeRange(null), 'sem zoom');
  });
});
