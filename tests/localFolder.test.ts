import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { remoteFolderFor, remoteLightFolderFor } from '../src/naming.ts';
import { UploadQueue } from '../src/queue.ts';
import { createFolderAccess, PickedFolderAccess, PrivateFolderAccess } from '../src/storage/folderAccess.ts';
import type { DirHandleLike, FileHandleLike, FolderAccess, FolderState, WritableLike } from '../src/storage/folderAccess.ts';
import { LocalFolderProvider } from '../src/storage/LocalFolderProvider.ts';
import { UploadError } from '../src/storage/StorageProvider.ts';
import { MemoryPhotoStore, makePhoto } from './helpers.ts';

/** Pasta em memória, com o mesmo comportamento básico das pastas do browser. */
class FakeFile implements FileHandleLike {
  content: Blob | undefined;
  writeError: Error | undefined;
  aborted = 0;
  async createWritable(): Promise<WritableLike> {
    let pending: Blob | undefined;
    return {
      write: async (data: Blob) => {
        if (this.writeError) throw this.writeError;
        pending = data;
      },
      close: async () => {
        this.content = pending;
      },
      abort: async () => {
        this.aborted += 1;
      },
    };
  }
}

class FakeDir implements DirHandleLike {
  readonly name: string;
  readonly dirs = new Map<string, FakeDir>();
  readonly files = new Map<string, FakeFile>();
  permission: 'granted' | 'denied' | 'prompt' = 'granted';
  grantOnRequest = true;
  constructor(name: string) {
    this.name = name;
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDir> {
    let d = this.dirs.get(name);
    if (!d) {
      if (!options?.create) throw new DOMException('não existe', 'NotFoundError');
      d = new FakeDir(name);
      this.dirs.set(name, d);
    }
    return d;
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFile> {
    let f = this.files.get(name);
    if (!f) {
      if (!options?.create) throw new DOMException('não existe', 'NotFoundError');
      f = new FakeFile();
      this.files.set(name, f);
    }
    return f;
  }
  async queryPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    return this.permission;
  }
  async requestPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    if (this.grantOnRequest) this.permission = 'granted';
    return this.permission;
  }
  /** Caminho de todos os ficheiros, para comparar. */
  paths(prefix = ''): string[] {
    const own = [...this.files.keys()].map((f) => `${prefix}${f}`);
    const sub = [...this.dirs.entries()].flatMap(([n, d]) => d.paths(`${prefix}${n}/`));
    return [...own, ...sub].sort();
  }
}

class FakeAccess implements FolderAccess {
  readonly kind = 'picked' as const;
  readonly degraded = false;
  stateValue: FolderState = 'ready';
  readonly root: FakeDir;
  constructor(root = new FakeDir('Inspeções')) {
    this.root = root;
  }
  async label() {
    return this.root.name;
  }
  async state() {
    return this.stateValue;
  }
  async getRoot() {
    return this.stateValue === 'ready' ? this.root : undefined;
  }
  async choose() {
    return true;
  }
  async authorize() {
    return true;
  }
  async ensureReady() {
    return this.stateValue === 'ready';
  }
}

const none = { list: async () => [] };

describe('LocalFolderProvider', () => {
  it('guarda a foto na estrutura de pastas do processo', async () => {
    const access = new FakeAccess();
    const provider = new LocalFolderProvider(access, none);
    const folder = '260098 - Praça de Portugal 7 Odivelas - Ana Exemplo/2. Fotos/Cozinha';
    const result = await provider.uploadPhoto({ folder, fileName: 'a.jpg', blob: new Blob(['abc']) });

    assert.equal(result.remotePath, `${folder}/a.jpg`);
    assert.deepEqual(access.root.paths(), [`${folder}/a.jpg`]);
    const file = (await (await (await (await access.root.getDirectoryHandle('260098 - Praça de Portugal 7 Odivelas - Ana Exemplo')).getDirectoryHandle('2. Fotos')).getDirectoryHandle('Cozinha')).getFileHandle('a.jpg'));
    assert.equal(await file.content?.text(), 'abc');
  });

  it('guardar outra vez o mesmo nome substitui (sem duplicados)', async () => {
    const access = new FakeAccess();
    const provider = new LocalFolderProvider(access, none);
    await provider.uploadPhoto({ folder: 'P/2. Fotos/Sala', fileName: 'a.jpg', blob: new Blob(['1']) });
    await provider.uploadPhoto({ folder: 'P/2. Fotos/Sala', fileName: 'a.jpg', blob: new Blob(['2']) });
    assert.deepEqual(access.root.paths(), ['P/2. Fotos/Sala/a.jpg']);
  });

  it('pasta ainda não escolhida: erro que se repete quando houver pasta', async () => {
    const access = new FakeAccess();
    access.stateValue = 'none';
    const provider = new LocalFolderProvider(access, none);
    await assert.rejects(provider.uploadPhoto({ folder: 'P', fileName: 'a.jpg', blob: new Blob(['x']) }), (e: unknown) => {
      assert.ok(e instanceof UploadError);
      assert.equal(e.retryable, true);
      assert.match(e.message, /escolher a pasta/);
      return true;
    });
  });

  it('falta autorização: pede para autorizar', async () => {
    const access = new FakeAccess();
    access.stateValue = 'needs-permission';
    const provider = new LocalFolderProvider(access, none);
    await assert.rejects(provider.uploadPhoto({ folder: 'P', fileName: 'a.jpg', blob: new Blob(['x']) }), /Autorizar/);
  });

  it('navegador sem suporte: erro definitivo', async () => {
    const access = new FakeAccess();
    access.stateValue = 'unsupported';
    const provider = new LocalFolderProvider(access, none);
    await assert.rejects(provider.uploadPhoto({ folder: 'P', fileName: 'a.jpg', blob: new Blob(['x']) }), (e: unknown) => {
      assert.ok(e instanceof UploadError);
      assert.equal(e.retryable, false);
      return true;
    });
  });

  it('recusa caminhos com ".." (nunca sai da pasta escolhida)', async () => {
    const access = new FakeAccess();
    const provider = new LocalFolderProvider(access, none);
    await assert.rejects(provider.uploadPhoto({ folder: '../fora', fileName: 'a.jpg', blob: new Blob(['x']) }), /inválido/);
    await assert.rejects(provider.uploadPhoto({ folder: 'P', fileName: '../a.jpg', blob: new Blob(['x']) }), /inválido/);
    assert.deepEqual(access.root.paths(), []);
  });

  it('traduz os erros do browser e cancela a escrita que falhou', async () => {
    const access = new FakeAccess();
    const provider = new LocalFolderProvider(access, none);
    const dir = await access.root.getDirectoryHandle('P', { create: true });
    const file = await dir.getFileHandle('a.jpg', { create: true });

    file.writeError = new DOMException('cheio', 'QuotaExceededError');
    await assert.rejects(provider.uploadPhoto({ folder: 'P', fileName: 'a.jpg', blob: new Blob(['x']) }), /espaço livre/);
    assert.equal(file.aborted, 1, 'a escrita incompleta é cancelada');

    file.writeError = new DOMException('sem permissão', 'NotAllowedError');
    await assert.rejects(provider.uploadPhoto({ folder: 'P', fileName: 'a.jpg', blob: new Blob(['x']) }), /autorização/);
  });
});

describe('fila com guardar no telemóvel', () => {
  const queues: UploadQueue[] = [];
  afterEach(() => {
    for (const q of queues.splice(0)) q.dispose();
  });

  it('guarda original e versão leve nas pastas certas mesmo sem rede', async () => {
    const access = new FakeAccess();
    const provider = new LocalFolderProvider(access, none);
    const store = new MemoryPhotoStore();
    const queue = new UploadQueue(store, provider, {
      isOnline: () => false, // sem rede: não interessa, escreve-se no telemóvel
      makeLight: async () => new Blob(['leve'], { type: 'image/jpeg' }),
    });
    queues.push(queue);
    await store.add(makePhoto('a', 1, { processFolder: '260098 - Rua A 1 - Ana', fileName: 'a.jpg' }));
    await queue.kick();

    assert.equal((await store.get('a'))?.status, 'sent');
    assert.deepEqual(access.root.paths(), [
      `${remoteFolderFor('260098 - Rua A 1 - Ana', 'Cozinha')}/a.jpg`,
      `${remoteLightFolderFor('260098 - Rua A 1 - Ana', 'Cozinha')}/a.jpg`,
    ].sort());
  });

  it('sem pasta escolhida as fotos ficam à espera e seguem logo que houver pasta', async () => {
    const access = new FakeAccess();
    access.stateValue = 'none';
    const provider = new LocalFolderProvider(access, none);
    const store = new MemoryPhotoStore();
    const queue = new UploadQueue(store, provider, { baseDelayMs: 1000 });
    queues.push(queue);
    await store.add(makePhoto('a', 1));
    await queue.kick();
    assert.equal((await store.get('a'))?.status, 'error');
    assert.ok((await store.get('a'))?.blob, 'a foto continua guardada na app');

    access.stateValue = 'ready';
    await queue.retryAll(); // o que acontece quando se toca em "Escolher pasta" / "Autorizar"
    assert.equal((await store.get('a'))?.status, 'sent');
    assert.equal(access.root.paths().length, 1);
  });
});

describe('PickedFolderAccess', () => {
  it('sem pasta → escolher → pronta, e lembra-se da pasta depois de reiniciar a app', async () => {
    const store = new MemoryPhotoStore();
    const picked = new FakeDir('Inspeções');
    const access = new PickedFolderAccess(store, async () => picked);
    assert.equal(await access.state(), 'none');
    assert.equal(await access.getRoot(), undefined);

    assert.equal(await access.choose(), true);
    assert.equal(await access.state(), 'ready');
    assert.equal(await access.label(), 'Inspeções');

    const afterRestart = new PickedFolderAccess(store, async () => picked);
    assert.equal(await afterRestart.state(), 'ready');
    assert.equal(await afterRestart.getRoot(), picked);
  });

  it('depois de reiniciar pode pedir autorização de novo', async () => {
    const store = new MemoryPhotoStore();
    const picked = new FakeDir('Inspeções');
    await new PickedFolderAccess(store, async () => picked).choose();
    picked.permission = 'prompt'; // o Android esqueceu a autorização

    const access = new PickedFolderAccess(store, async () => picked);
    assert.equal(await access.state(), 'needs-permission');
    assert.equal(await access.getRoot(), undefined);
    assert.equal(await access.ensureReady(), true);
    assert.equal(await access.state(), 'ready');
  });

  it('autorização recusada: continua por autorizar', async () => {
    const store = new MemoryPhotoStore();
    const picked = new FakeDir('Inspeções');
    await new PickedFolderAccess(store, async () => picked).choose();
    picked.permission = 'prompt';
    picked.grantOnRequest = false;
    const access = new PickedFolderAccess(store, async () => picked);
    assert.equal(await access.ensureReady(), false);
    assert.equal(await access.state(), 'needs-permission');
  });

  it('ensureReady sem pasta abre o seletor; se o inspetor cancelar, fica sem pasta', async () => {
    const store = new MemoryPhotoStore();
    let calls = 0;
    const access = new PickedFolderAccess(store, async () => {
      calls += 1;
      throw new DOMException('cancelado', 'AbortError');
    });
    assert.equal(await access.ensureReady(), false);
    assert.equal(calls, 1);
    assert.equal(await access.state(), 'none');
  });

  it('outros erros do seletor não são engolidos', async () => {
    const store = new MemoryPhotoStore();
    const access = new PickedFolderAccess(store, async () => {
      throw new DOMException('pasta do sistema', 'SecurityError');
    });
    await assert.rejects(access.choose(), /pasta do sistema/);
  });
});

describe('createFolderAccess', () => {
  it('sem seletor de pastas no navegador usa a memória interna e marca-o como recurso (degraded)', () => {
    const access = createFolderAccess(new MemoryPhotoStore(), '');
    assert.ok(access instanceof PrivateFolderAccess);
    assert.equal(access.kind, 'private');
    assert.equal(access.degraded, true);
  });

  it('"?storage=private" força a memória interna de propósito, sem aviso', () => {
    const access = createFolderAccess(new MemoryPhotoStore(), '?storage=private');
    assert.equal(access.kind, 'private');
    assert.equal(access.degraded, false);
  });

  it('a pasta escolhida nunca é um recurso', async () => {
    const access = new PickedFolderAccess(new MemoryPhotoStore(), async () => new FakeDir('Inspeções'));
    assert.equal(access.degraded, false);
  });
});
