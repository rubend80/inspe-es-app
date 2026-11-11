import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { lightFileNameFor, remoteFolderFor, remoteLightFolderFor } from '../src/naming.ts';
import { PhotoService } from '../src/photoService.ts';
import { UploadQueue } from '../src/queue.ts';
import { UploadError } from '../src/storage/StorageProvider.ts';
import { summarize, unsentCount } from '../src/summary.ts';
import { FakeProvider, MemoryPhotoStore, makePhoto } from './helpers.ts';

const queues: UploadQueue[] = [];
afterEach(() => {
  for (const q of queues.splice(0)) q.dispose();
});

function setup(opts: { isOnline?: () => boolean; now?: () => number } = {}) {
  const store = new MemoryPhotoStore();
  const provider = new FakeProvider();
  const queue = new UploadQueue(store, provider, { baseDelayMs: 1000, maxDelayMs: 8000, ...opts });
  queues.push(queue);
  return { store, provider, queue };
}

describe('UploadQueue', () => {
  it('envia as fotos por ordem em que foram tiradas e liberta a foto local', async () => {
    const { store, provider, queue } = setup();
    await store.add(makePhoto('b', 2000));
    await store.add(makePhoto('a', 1000));
    await queue.kick();

    assert.deepEqual(provider.uploaded.map((u) => u.fileName), ['a.jpg', 'b.jpg']);
    assert.equal(provider.uploaded[0]?.folder, remoteFolderFor('2026-0142', 'Cozinha'), 'a foto vai para a pasta da divisão');
    const a = await store.get('a');
    assert.equal(a?.status, 'sent');
    assert.equal(a?.remotePath, `${remoteFolderFor('2026-0142', 'Cozinha')}/a.jpg`);
    assert.equal(a?.blob, undefined, 'a foto original sai do telemóvel depois de enviada');
  });

  it('falha temporária: fica com erro, espera e volta a tentar', async () => {
    let clock = 10_000;
    const { store, provider, queue } = setup({ now: () => clock });
    provider.failures.push(new Error('sem ligação'));
    await store.add(makePhoto('a', 1));

    await queue.kick();
    let a = await store.get('a');
    assert.equal(a?.status, 'error');
    assert.equal(a?.attempts, 1);
    assert.equal(a?.lastError, 'sem ligação');
    assert.equal(a?.nextRetryAt, 11_000);

    await queue.kick(); // ainda não passou o tempo de espera
    assert.equal((await store.get('a'))?.status, 'error');
    assert.equal(provider.uploaded.length, 0);

    clock = 11_000;
    await queue.kick();
    a = await store.get('a');
    assert.equal(a?.status, 'sent');
    assert.equal(a?.lastError, undefined);
  });

  it('a espera duplica a cada falha seguida, com limite', async () => {
    let clock = 0;
    const { store, provider, queue } = setup({ now: () => clock });
    for (let i = 0; i < 5; i++) provider.failures.push(new Error('x'));
    await store.add(makePhoto('a', 1));

    const waits: number[] = [];
    for (let i = 0; i < 5; i++) {
      await queue.kick();
      const a = await store.get('a');
      waits.push((a?.nextRetryAt ?? 0) - clock);
      clock = a?.nextRetryAt ?? clock;
    }
    assert.deepEqual(waits, [1000, 2000, 4000, 8000, 8000]);
  });

  it('sem rede não tenta enviar; com rede envia', async () => {
    let online = false;
    const { store, provider, queue } = setup({ isOnline: () => online });
    await store.add(makePhoto('a', 1));

    await queue.kick();
    assert.equal(provider.uploaded.length, 0);
    assert.equal((await store.get('a'))?.status, 'pending');

    online = true;
    await queue.kick();
    assert.equal((await store.get('a'))?.status, 'sent');
  });

  it('erro definitivo não é repetido sozinho, mas pode ser repetido à mão', async () => {
    let clock = 0;
    const { store, provider, queue } = setup({ now: () => clock });
    provider.failures.push(new UploadError('Sem permissão na pasta', { retryable: false }));
    await store.add(makePhoto('a', 1));

    await queue.kick();
    const failed = await store.get('a');
    assert.equal(failed?.status, 'error');
    assert.equal(failed?.nextRetryAt, undefined);

    clock = 10 * 60_000;
    await queue.kick();
    assert.equal(provider.uploaded.length, 0, 'não repete sozinho');

    await queue.retry('a');
    assert.equal((await store.get('a'))?.status, 'sent');
  });

  it('retryAll volta a pôr em fila todas as fotos com erro', async () => {
    const { store, provider, queue } = setup();
    provider.failures.push(new Error('x'), new Error('y'));
    await store.add(makePhoto('a', 1));
    await store.add(makePhoto('b', 2));
    await queue.kick();
    assert.equal(summarize(await store.list()).error, 2);

    await queue.retryAll();
    assert.equal(summarize(await store.list()).sent, 2);
  });

  it('recover: o que ficou "a enviar" quando a app fechou volta a "por enviar"', async () => {
    const { store, queue } = setup();
    await store.add(makePhoto('a', 1, { status: 'uploading' }));
    await queue.recover();
    assert.equal((await store.get('a'))?.status, 'pending');
  });

  it('foto sem ficheiro local dá erro definitivo em vez de ficar presa', async () => {
    const { store, queue } = setup();
    await store.add(makePhoto('a', 1, { blob: undefined }));
    await queue.kick();
    const a = await store.get('a');
    assert.equal(a?.status, 'error');
    assert.equal(a?.retryable, false);
  });

  it('discard só elimina fotos que ainda não foram enviadas', async () => {
    const { store, queue } = setup();
    await store.add(makePhoto('pendente', 1));
    await store.add(makePhoto('enviada', 2, { status: 'sent', blob: undefined }));
    await store.add(makePhoto('a-enviar', 3, { status: 'uploading' }));

    assert.equal(await queue.discard('pendente'), true);
    assert.equal(await queue.discard('enviada'), false);
    assert.equal(await queue.discard('a-enviar'), false);
    assert.equal(await store.get('pendente'), undefined);
  });

  it('avisa os ouvintes quando algo muda', async () => {
    const { store, queue } = setup();
    let calls = 0;
    queue.subscribe(() => {
      calls += 1;
    });
    await store.add(makePhoto('a', 1));
    await queue.kick();
    assert.ok(calls >= 2, 'pelo menos "a enviar" e "enviada"');
  });
});

describe('UploadQueue com versão leve', () => {
  const light = async (original: Blob): Promise<Blob> => new Blob([`leve:${original.size}`], { type: 'image/jpeg' });

  function setupLight(makeLight: (b: Blob) => Promise<Blob> = light) {
    const store = new MemoryPhotoStore();
    const provider = new FakeProvider();
    let clock = 0;
    const queue = new UploadQueue(store, provider, { baseDelayMs: 1000, maxDelayMs: 8000, now: () => clock, makeLight });
    queues.push(queue);
    return { store, provider, queue, tick: (ms: number) => void (clock += ms) };
  }

  it('envia o original para 2. Fotos e a versão leve para 3. Fotos - Light', async () => {
    const { store, provider, queue } = setupLight();
    await store.add(makePhoto('a', 1, { fileName: 'a.png', mimeType: 'image/png' }));
    await queue.kick();

    assert.deepEqual(
      provider.uploaded.map((u) => `${u.folder}|${u.fileName}`),
      [`${remoteFolderFor('2026-0142', 'Cozinha')}|a.png`, `${remoteLightFolderFor('2026-0142', 'Cozinha')}|a.jpg`],
    );
    const a = await store.get('a');
    assert.equal(a?.status, 'sent');
    assert.equal(a?.remotePath, `${remoteFolderFor('2026-0142', 'Cozinha')}/a.png`);
    assert.equal(a?.lightRemotePath, `${remoteLightFolderFor('2026-0142', 'Cozinha')}/a.jpg`);
    assert.ok((a?.lightSize ?? 0) > 0);
    assert.equal(a?.blob, undefined, 'só se apaga o original quando as duas versões seguiram');
  });

  it('a versão leve é feita a partir do original', async () => {
    const { store, provider, queue } = setupLight();
    await store.add(makePhoto('a', 1, { blob: new Blob(['0123456789'], { type: 'image/jpeg' }) }));
    await queue.kick();
    assert.equal(provider.uploaded[0]?.blob.size, 10);
    assert.equal(await provider.uploaded[1]?.blob.text(), 'leve:10');
  });

  it('falha só na versão leve: o original fica no sítio, a foto não conta como enviada e o original não se repete', async () => {
    const { store, provider, queue, tick } = setupLight();
    let failLight = true;
    provider.failWhen = (req) => (failLight && req.folder.includes('Light') ? new Error('sem ligação') : undefined);
    await store.add(makePhoto('a', 1));

    await queue.kick();
    let a = await store.get('a');
    assert.equal(a?.status, 'error');
    assert.equal(a?.lastError, 'Versão leve: sem ligação');
    assert.ok(a?.remotePath, 'o original já seguiu');
    assert.equal(a?.lightRemotePath, undefined);
    assert.ok(a?.blob, 'o original continua no telemóvel até ir tudo');
    assert.equal(unsentCount(summarize(await store.list())), 1);

    failLight = false;
    tick(1000);
    await queue.kick();
    a = await store.get('a');
    assert.equal(a?.status, 'sent');
    assert.ok(a?.lightRemotePath);
    assert.equal(a?.blob, undefined);
    assert.equal(
      provider.uploaded.filter((u) => !u.folder.includes('Light')).length,
      1,
      'o original foi enviado uma só vez (sem duplicados)',
    );
    assert.equal(provider.uploaded.filter((u) => u.folder.includes('Light')).length, 1);
  });

  it('falha no original: não se tenta a versão leve nessa volta', async () => {
    const { store, provider, queue } = setupLight();
    provider.failures.push(new Error('sem ligação'));
    await store.add(makePhoto('a', 1));
    await queue.kick();
    const a = await store.get('a');
    assert.equal(a?.status, 'error');
    assert.equal(a?.lastError, 'sem ligação');
    assert.equal(provider.uploaded.length, 0);
  });

  it('se não for possível criar a versão leve: erro definitivo, original já guardado', async () => {
    const { store, provider, queue } = setupLight(async () => {
      throw new Error('imagem inválida');
    });
    await store.add(makePhoto('a', 1));
    await queue.kick();
    const a = await store.get('a');
    assert.equal(a?.status, 'error');
    assert.equal(a?.retryable, false, 'não repete sozinho; só quando o inspetor tocar em "tentar novamente"');
    assert.match(a?.lastError ?? '', /versão leve.*imagem inválida/);
    assert.equal(provider.uploaded.length, 1, 'o original seguiu');
  });

  it('"tentar novamente" depois de um erro definitivo envia só o que falta', async () => {
    let broken = true;
    const { store, provider, queue } = setupLight(async (b) => {
      if (broken) throw new Error('imagem inválida');
      return light(b);
    });
    await store.add(makePhoto('a', 1));
    await queue.kick();
    broken = false;
    await queue.retry('a');
    await queue.kick();
    assert.equal((await store.get('a'))?.status, 'sent');
    assert.equal(provider.uploaded.filter((u) => !u.folder.includes('Light')).length, 1);
    assert.equal(provider.uploaded.filter((u) => u.folder.includes('Light')).length, 1);
  });

  it('o nome da versão leve acompanha o do original', () => {
    assert.equal(lightFileNameFor('x.jpg'), 'x.jpg');
  });
});

describe('PhotoService', () => {
  const process = { id: '2026-0142', name: 'Rua das Flores 12', folder: '2026-0142' };
  const cozinha = { id: 'cozinha', name: 'Cozinha', folder: 'Cozinha' };
  const banho = { id: 'casa-de-banho-1', name: 'Casa de banho 1', folder: 'Casa de banho 1' };

  it('guarda a foto na pasta da divisão, com o nome certo e miniatura, e envia', async () => {
    const store = new MemoryPhotoStore();
    const provider = new FakeProvider();
    const queue = new UploadQueue(store, provider);
    queues.push(queue);
    let n = 0;
    const photos = new PhotoService(store, queue, async () => ({ thumb: new Blob(['t']), preview: new Blob(['p']), width: 4000, height: 3000 }), () => `id-${++n}`);

    const takenAt = new Date(2026, 10, 3, 14, 30, 15);
    const rec = await photos.addPhoto(process, cozinha, new Blob(['abc'], { type: 'image/jpeg' }), takenAt);
    await queue.kick();

    assert.equal(rec.fileName, '2026-0142_20261103_143015_001_cozinha.jpg');
    const saved = await store.get('id-1');
    assert.equal(saved?.divisionId, 'cozinha');
    assert.equal(saved?.divisionName, 'Cozinha');
    assert.ok(saved?.thumb, 'a miniatura fica guardada');
    assert.ok(saved?.preview, 'a pré-visualização fica guardada');
    assert.equal(saved?.width, 4000);
    assert.equal(saved?.height, 3000);
    assert.equal(saved?.blob, undefined, 'a original é apagada depois de enviada (a pré-visualização fica)');
    assert.equal(saved?.status, 'sent');
    assert.equal(provider.uploaded[0]?.folder, remoteFolderFor('2026-0142', 'Cozinha'));
  });

  it('numa fração: pasta da fração entre "2. Fotos" e a divisão, no original e na versão leve', async () => {
    const store = new MemoryPhotoStore();
    const provider = new FakeProvider();
    const queue = new UploadQueue(store, provider, { makeLight: async () => new Blob(['l'], { type: 'image/jpeg' }) });
    queues.push(queue);
    let n = 0;
    const photos = new PhotoService(store, queue, async () => ({}), () => `id-${++n}`);
    const fracaoA = { id: 'fracao-a', name: 'Fração A', folder: 'Fração A' };

    const takenAt = new Date(2026, 10, 3, 14, 30, 15);
    const rec = await photos.addPhoto(process, cozinha, new Blob(['abc'], { type: 'image/jpeg' }), takenAt, fracaoA);
    await queue.kick();

    assert.equal(rec.fileName, '2026-0142_20261103_143015_001_fracao-a_cozinha.jpg');
    const saved = await store.get('id-1');
    assert.equal(saved?.fractionId, 'fracao-a');
    assert.equal(saved?.fractionName, 'Fração A');
    assert.equal(saved?.fractionFolder, 'Fração A');
    assert.equal(saved?.status, 'sent');
    assert.deepEqual(
      provider.uploaded.map((u) => u.folder),
      [remoteFolderFor('2026-0142', 'Cozinha', 'Fração A'), remoteLightFolderFor('2026-0142', 'Cozinha', 'Fração A')],
    );
    assert.equal(provider.uploaded[0]?.folder, '2026-0142/2. Fotos/Fração A/Cozinha');
  });

  it('a mesma divisão em frações diferentes (e sem fração) vai para pastas diferentes', async () => {
    const store = new MemoryPhotoStore();
    const provider = new FakeProvider();
    const queue = new UploadQueue(store, provider);
    queues.push(queue);
    const photos = new PhotoService(store, queue, async () => ({}));
    const a = { id: 'fracao-a', name: 'Fração A', folder: 'Fração A' };
    const b = { id: 'fracao-b', name: 'Fração B', folder: 'Fração B' };
    await photos.addPhoto(process, cozinha, new Blob(['1']), undefined, a);
    await photos.addPhoto(process, cozinha, new Blob(['2']), undefined, b);
    await photos.addPhoto(process, cozinha, new Blob(['3']));
    await queue.kick();
    assert.deepEqual(
      provider.uploaded.map((u) => u.folder).sort(),
      ['2026-0142/2. Fotos/Cozinha', '2026-0142/2. Fotos/Fração A/Cozinha', '2026-0142/2. Fotos/Fração B/Cozinha'],
    );
  });

  it('fotos de divisões diferentes vão para pastas diferentes', async () => {
    const store = new MemoryPhotoStore();
    const provider = new FakeProvider();
    const queue = new UploadQueue(store, provider);
    queues.push(queue);
    const photos = new PhotoService(store, queue, async () => ({}));

    await photos.addPhoto(process, cozinha, new Blob(['1']));
    await photos.addPhoto(process, banho, new Blob(['2']));
    await queue.kick();

    assert.deepEqual(
      provider.uploaded.map((u) => u.folder).sort(),
      [remoteFolderFor('2026-0142', 'Casa de banho 1'), remoteFolderFor('2026-0142', 'Cozinha')].sort(),
    );
  });

  it('o número de ordem sobe a cada foto do mesmo processo e dia', async () => {
    const store = new MemoryPhotoStore();
    const queue = new UploadQueue(store, new FakeProvider(), { isOnline: () => false });
    queues.push(queue);
    let n = 0;
    const photos = new PhotoService(store, queue, async () => ({}), () => `id-${++n}`);

    const takenAt = new Date(2026, 10, 3, 14, 30, 15);
    const a = await photos.addPhoto(process, cozinha, new Blob(['1']), takenAt);
    const b = await photos.addPhoto(process, banho, new Blob(['2']), takenAt);
    const outro = await photos.addPhoto({ ...process, id: '2026-0143', folder: '2026-0143' }, cozinha, new Blob(['3']), takenAt);

    assert.match(a.fileName, /_001_cozinha\.jpg$/);
    assert.match(b.fileName, /_002_casa-de-banho-1\.jpg$/);
    assert.match(outro.fileName, /_001_cozinha\.jpg$/);
  });

  it('a foto fica guardada mesmo sem rede', async () => {
    const store = new MemoryPhotoStore();
    const provider = new FakeProvider();
    const queue = new UploadQueue(store, provider, { isOnline: () => false });
    queues.push(queue);
    const photos = new PhotoService(store, queue, async () => ({}), () => 'x');

    await photos.addPhoto(process, cozinha, new Blob(['abc']));
    await queue.kick();
    const s = summarize(await store.list());
    assert.equal(unsentCount(s), 1);
    assert.equal(provider.uploaded.length, 0);
  });
});
