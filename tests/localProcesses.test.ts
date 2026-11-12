import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLocalProcess, LocalProcessList } from '../src/localProcesses.ts';
import { MemoryPhotoStore } from './helpers.ts';

describe('buildLocalProcess (só o número)', () => {
  it('a pasta do processo é o número', () => {
    const r = buildLocalProcess({ id: '260098' }, []);
    assert.ok(r.ok);
    assert.deepEqual(r.process, { id: '260098', name: '260098', folder: '260098' });
  });

  it('aceita espaços no número (ex.: colado de outro sítio)', () => {
    const r = buildLocalProcess({ id: ' 2600 98 ' }, []);
    assert.ok(r.ok);
    assert.equal(r.process.id, '260098');
  });

  it('valida o número e os duplicados, com mensagens claras', () => {
    const mau = buildLocalProcess({ id: '26a098' }, []);
    assert.ok(!mau.ok && /algarismos/.test(mau.error));
    const vazio = buildLocalProcess({ id: '  ' }, []);
    assert.ok(!vazio.ok);
    const duplicado = buildLocalProcess({ id: '260098' }, [{ id: '260098', name: '260098', folder: '260098' }]);
    assert.ok(!duplicado.ok && /Já existe/.test(duplicado.error));
  });
});

describe('LocalProcessList', () => {
  it('guarda, lista e remove processos (e lembra-se depois de reiniciar)', async () => {
    const store = new MemoryPhotoStore();
    const list = new LocalProcessList(store);
    assert.deepEqual(await list.list(), []);
    const a = await list.add({ id: '260098' });
    const b = await list.add({ id: '260099' });
    assert.ok(a.ok && b.ok);
    assert.deepEqual((await new LocalProcessList(store).list()).map((p) => p.id), ['260098', '260099']);
    assert.ok(!(await list.add({ id: '260098' })).ok);
    await list.remove('260098');
    assert.deepEqual((await list.list()).map((p) => p.id), ['260099']);
  });
});
