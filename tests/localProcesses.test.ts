import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLocalProcess, LocalProcessList } from '../src/localProcesses.ts';
import { parseProcessFolderName } from '../src/processNames.ts';
import { MemoryPhotoStore } from './helpers.ts';

describe('buildLocalProcess', () => {
  it('cria a pasta "<n.º> - <morada> - <cliente>"', () => {
    const r = buildLocalProcess({ id: '260098', address: 'Praça de Portugal 7 Odivelas', client: 'Ana Exemplo' }, []);
    assert.ok(r.ok);
    assert.equal(r.process.id, '260098');
    assert.equal(r.process.name, 'Praça de Portugal 7 Odivelas');
    assert.equal(r.process.client, 'Ana Exemplo');
    assert.equal(r.process.folder, '260098 - Praça de Portugal 7 Odivelas - Ana Exemplo');
  });

  it('o cliente é opcional', () => {
    const r = buildLocalProcess({ id: '260098', address: 'Rua A 1', client: '  ' }, []);
    assert.ok(r.ok);
    assert.equal(r.process.folder, '260098 - Rua A 1');
    assert.equal(r.process.client, undefined);
  });

  it('a pasta criada volta a ser lida como o mesmo processo', () => {
    const r = buildLocalProcess({ id: '260098', address: 'Rua A 1, Lisboa', client: 'Ana Exemplo' }, []);
    assert.ok(r.ok);
    const parsed = parseProcessFolderName(r.process.folder);
    assert.deepEqual(parsed, { id: '260098', address: 'Rua A 1, Lisboa', client: 'Ana Exemplo' });
  });

  it('limpa caracteres que não podem ir em nomes de pastas e " - " dentro dos textos', () => {
    const r = buildLocalProcess({ id: '260098', address: 'Rua A/B: "Bloco" - 3.º Dto.', client: 'Rui?' }, []);
    assert.ok(r.ok);
    assert.doesNotMatch(r.process.folder, /["*:<>?/\\|]/);
    assert.equal(parseProcessFolderName(r.process.folder)?.client, 'Rui-');
    assert.equal(parseProcessFolderName(r.process.folder)?.id, '260098');
  });

  it('valida o número, a morada e duplicados, com mensagens claras', () => {
    const existing = [{ id: '260098', name: 'x', folder: '260098 - x' }];
    assert.match(buildLocalProcess({ id: '26 00 98x', address: 'a' }, []).ok ? '' : (buildLocalProcess({ id: '26 00 98x', address: 'a' }, []) as { error: string }).error, /algarismos/);
    const semMorada = buildLocalProcess({ id: '260099', address: '   ' }, existing);
    assert.ok(!semMorada.ok && /morada/.test(semMorada.error));
    const duplicado = buildLocalProcess({ id: '260098', address: 'Outra' }, existing);
    assert.ok(!duplicado.ok && /Já existe/.test(duplicado.error));
  });

  it('aceita espaços no número (ex.: colado de outro sítio)', () => {
    const r = buildLocalProcess({ id: ' 2600 98 ', address: 'Rua A' }, []);
    assert.ok(r.ok);
    assert.equal(r.process.id, '260098');
  });

  it('corta textos muito compridos (limite de caminhos do SharePoint)', () => {
    const r = buildLocalProcess({ id: '260098', address: 'M'.repeat(300), client: 'C'.repeat(300) }, []);
    assert.ok(r.ok);
    assert.ok(r.process.folder.length <= 6 + 3 + 80 + 3 + 60);
  });
});

describe('LocalProcessList', () => {
  it('guarda, lista e remove processos (e lembra-se depois de reiniciar)', async () => {
    const store = new MemoryPhotoStore();
    const list = new LocalProcessList(store);
    assert.deepEqual(await list.list(), []);

    const a = await list.add({ id: '260098', address: 'Rua A 1', client: 'Ana' });
    const b = await list.add({ id: '260099', address: 'Rua B 2' });
    assert.ok(a.ok && b.ok);
    assert.deepEqual((await new LocalProcessList(store).list()).map((p) => p.id), ['260098', '260099']);

    const repetido = await list.add({ id: '260098', address: 'Outra' });
    assert.ok(!repetido.ok);
    assert.equal((await list.list()).length, 2);

    await list.remove('260098');
    assert.deepEqual((await list.list()).map((p) => p.id), ['260099']);
  });
});
