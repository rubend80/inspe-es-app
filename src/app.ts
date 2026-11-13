import { isNativeApp } from './native/nativePhotos.ts';
import { SESSION_KEY } from './ui/nativeSession.ts';
import type { NativeSession } from './ui/nativeSession.ts';
import type { AppContext } from './context.ts';
import { divisionsForProcess, makeDivision } from './divisions.ts';
import type { DivisionScope } from './divisions.ts';
import { COMMON_AREA, fractionsForProcess, inFraction, makeFraction, scopeOf } from './fractions.ts';
import { PhotoService } from './photoService.ts';
import { UploadQueue } from './queue.ts';
import { divisionHash, divisionsHash, fractionsHash, homeHash, parseRoute } from './routes.ts';
import { IdbPhotoStore } from './storage/idb.ts';
import { createStorage } from './storage/index.ts';
import type { Division, Fraction, Process } from './types.ts';
import { mountCapture } from './ui/capture.ts';
import { mountHome } from './ui/home.ts';
import { mountProcess } from './ui/process.ts';
import { mountFractions } from './ui/fractionsList.ts';
import { mountDivisions } from './ui/divisionsScreen.ts';
import { processImage } from './ui/image.ts';

const PROCESSES_KEY = 'processes';
const extraDivisionsKey = (processId: string, scope: DivisionScope = 'unit'): string =>
  scope === 'common' ? `divisions-common:${processId}` : scope === 'house' ? `divisions-house:${processId}` : `divisions:${processId}`;
const extraFractionsKey = (processId: string): string => `fractions:${processId}`;

export function startApp(root: HTMLElement): void {
  const store = new IdbPhotoStore();
  const { provider, demo, folder, localProcesses } = createStorage(store, location.search);
  // Sem versão leve ("3. Fotos - Light"): só o original. Para a voltar a ter: { makeLight: makeLightVersion } (src/ui/image.ts).
  const queue = new UploadQueue(store, provider);
  const photos = new PhotoService(store, queue, processImage);
  let memory: Process[] | null = null;

  const ctx: AppContext = {
    store,
    provider,
    queue,
    photos,
    demo,
    folder,
    localProcesses,
    async cachedProcesses() {
      if (localProcesses) return localProcesses.list();
      if (memory) return memory;
      return (await store.getMeta<Process[]>(PROCESSES_KEY)) ?? [];
    },
    async loadProcesses() {
      if (localProcesses) return { processes: await localProcesses.list(), fromCache: false };
      if (navigator.onLine !== false) {
        try {
          const list = await provider.listProcesses();
          memory = list;
          await store.setMeta(PROCESSES_KEY, list);
          return { processes: list, fromCache: false };
        } catch {
          /* usa a lista guardada */
        }
      }
      return { processes: await ctx.cachedProcesses(), fromCache: true };
    },
    async findProcess(id) {
      const cached = (await ctx.cachedProcesses()).find((p) => p.id === id);
      if (cached) return cached;
      return (await ctx.loadProcesses()).processes.find((p) => p.id === id);
    },
    divisions: {
      async list(processId, scope = 'unit') {
        const extras = (await store.getMeta<Division[]>(extraDivisionsKey(processId, scope))) ?? [];
        const photos = (await store.listByProcess(processId)).filter((p) => scopeOf(p.fractionId) === scope);
        return divisionsForProcess(extras, photos, scope);
      },
      async add(processId, name, scope = 'unit') {
        const made = makeDivision(name);
        if (!made) return undefined;
        const existing = (await ctx.divisions.list(processId, scope)).find((d) => d.id === made.id);
        if (existing) return existing;
        const extras = (await store.getMeta<Division[]>(extraDivisionsKey(processId, scope))) ?? [];
        await store.setMeta(extraDivisionsKey(processId, scope), [...extras, made]);
        return made;
      },
    },
    fractions: {
      async list(processId) {
        const extras = (await store.getMeta<Fraction[]>(extraFractionsKey(processId))) ?? [];
        return fractionsForProcess(extras, await store.listByProcess(processId));
      },
      async add(processId, name) {
        const made = makeFraction(name);
        if (!made) return undefined;
        const existing = (await ctx.fractions.list(processId)).find((f) => f.id === made.id);
        if (existing) return existing;
        const extras = (await store.getMeta<Fraction[]>(extraFractionsKey(processId))) ?? [];
        await store.setMeta(extraFractionsKey(processId), [...extras, made]);
        return made;
      },
      async remove(processId, fractionId) {
        const photos = await store.listByProcess(processId);
        if (photos.some((p) => inFraction(p, fractionId))) return false;
        const extras = (await store.getMeta<Fraction[]>(extraFractionsKey(processId))) ?? [];
        await store.setMeta(
          extraFractionsKey(processId),
          extras.filter((f) => f.id !== fractionId),
        );
        return true;
      },
    },
  };

  // Fotos guardadas mas não enviadas (app fechada, sem rede...) seguem logo que possível.
  void queue
    .recover()
    .then(() => queue.kick())
    .catch(() => undefined);
  window.addEventListener('online', () => void queue.kick());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void queue.kick();
  });

  // Pede ao Android para não apagar os dados da app quando houver pouco espaço (as fotos por enviar estão lá).
  void navigator.storage?.persist?.().catch(() => undefined);

  let unmount: (() => void) | null = null;
  let token = 0;

  async function render(): Promise<void> {
    const mine = ++token;
    unmount?.();
    unmount = null;
    root.replaceChildren();

    const route = parseRoute(location.hash);
    if (route.name === 'home') {
      unmount = mountHome(root, ctx);
      return;
    }

    const process = await ctx.findProcess(route.processId);
    if (mine !== token) return;
    if (!process) {
      location.replace(homeHash()); // processo desconhecido: volta à lista
      return;
    }
    if (route.name === 'process') {
      unmount = mountProcess(root, ctx, process);
      return;
    }
    if (route.name === 'fractions') {
      unmount = mountFractions(root, ctx, process);
      return;
    }

    let fraction: Fraction | undefined;
    if (route.fractionId) {
      fraction =
        route.fractionId === COMMON_AREA.id
          ? COMMON_AREA
          : (await ctx.fractions.list(process.id)).find((f) => f.id === route.fractionId);
      if (mine !== token) return;
      if (!fraction) {
        location.replace(fractionsHash(process.id)); // fração desconhecida: volta à lista das frações
        return;
      }
    }

    if (route.name === 'divisions') {
      unmount = mountDivisions(root, ctx, process, fraction);
      return;
    }

    const division = (await ctx.divisions.list(process.id, scopeOf(fraction))).find((d) => d.id === route.divisionId);
    if (mine !== token) return;
    if (!division) {
      location.replace(divisionsHash(process.id, fraction?.id)); // divisão desconhecida: volta às divisões
      return;
    }
    unmount = mountCapture(root, ctx, process, division, fraction);
  }

  window.addEventListener('hashchange', () => void render());
  void (async () => {
    // App Android: se o Android fechou a app enquanto a câmara estava aberta, volta à divisão que estava a ser fotografada.
    if (isNativeApp() && (!location.hash || location.hash === '#/')) {
      const s = await store.getMeta<NativeSession>(SESSION_KEY);
      if (s?.processId && s.divisionId) location.replace(divisionHash(s.processId, s.divisionId, s.fractionId));
    }
    void render();
  })();
}
