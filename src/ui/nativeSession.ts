import type { AppContext } from '../context.ts';
import { base64ToBlob, NATIVE_ROOT, NativePhotos } from '../native/nativePhotos.ts';
import type { MediaItem } from '../native/nativePhotos.ts';
import type { Division, Fraction, Process } from '../types.ts';
import { h, toast } from './dom.ts';

/** Sessão de fotos com a câmara do telemóvel (guardada para sobreviver se o Android fechar a app). */
export interface NativeSession {
  id: string;
  processId: string;
  divisionId: string;
  fractionId?: string;
  since: number;
}

export const SESSION_KEY = 'native-session';
const IMPORTED_KEY = 'native-imported';
const MAX_REMEMBERED = 5000;

/**
 * App Android: "Fotografar" abre a câmara normal do telemóvel (várias fotos seguidas, zoom, modos).
 * Ao voltar, todas as fotos tiradas entretanto são copiadas, tal e qual, para a pasta desta divisão.
 */
export function createNativeSession(
  ctx: AppContext,
  process: Process,
  division: Division,
  fraction: Fraction | undefined,
  extra: HTMLElement[],
): { el: HTMLElement; dispose: () => void } {
  let disposed = false;
  let importing = false;
  let session: NativeSession | undefined;

  const status = h('p', { class: 'native-status', hidden: true });
  const importBtn = h(
    'button',
    { class: 'btn', type: 'button', hidden: true, onclick: () => void importNew(true) },
    'Juntar as fotos novas agora',
  );
  const el = h(
    'section',
    { class: 'phone-cam' },
    h(
      'button',
      { class: 'btn primary big', type: 'button', onclick: () => void start() },
      'Fotografar com a câmara do telemóvel',
    ),
    status,
    importBtn,
    h(
      'p',
      { class: 'hint' },
      'Abre a câmara normal do telemóvel: tire as fotos todas desta divisão, seguidas, e volte à app. ' +
        'As fotos tiradas entretanto entram sozinhas aqui, tal e qual saíram da câmara.',
    ),
    ...extra,
  );

  const matches = (s: NativeSession | undefined): s is NativeSession =>
    !!s && s.processId === process.id && s.divisionId === division.id && (s.fractionId ?? '') === (fraction?.id ?? '');

  function showStatus(): void {
    status.hidden = !session;
    importBtn.hidden = !session;
    if (session) {
      const t = new Date(session.since);
      status.textContent = `A juntar as fotos tiradas desde as ${t.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}.`;
    }
  }

  async function start(): Promise<void> {
    try {
      const { granted } = await NativePhotos.ensurePermission();
      if (!granted) {
        toast('Sem autorização para ver as fotos, a app não as consegue juntar. Em Definições → Apps → Inspeções → Permissões, escolha "Permitir todas" nas fotos.', 8000);
        return;
      }
      // Fotos de uma sessão anterior desta divisão ainda por juntar entram primeiro.
      if (session) await importNew(false);
      const since = Date.now();
      session = { id: crypto.randomUUID(), processId: process.id, divisionId: division.id, since, ...(fraction ? { fractionId: fraction.id } : {}) };
      await ctx.store.setMeta(SESSION_KEY, session);
      showStatus();
      await NativePhotos.openCamera();
    } catch (err) {
      toast(`Não foi possível abrir a câmara: ${err instanceof Error ? err.message : String(err)}`, 6000);
    }
  }

  async function importNew(manual: boolean): Promise<void> {
    if (!session || importing || disposed) return;
    importing = true;
    try {
      const from = session.since - 2000;
      const { items: listed } = await NativePhotos.listSince({ since: from });
      // Segurança: só as fotos tiradas depois de abrir a câmara, mesmo que o telemóvel devolva mais.
      const items = listed.filter((i) => i.dateAdded >= from - 1000 || i.dateTaken >= from);
      const remembered = (await ctx.store.getMeta<string[]>(IMPORTED_KEY)) ?? [];
      const done = new Set(remembered);
      const fresh = items.filter((i) => !done.has(i.id));
      if (fresh.length === 0) {
        if (manual) toast('Ainda não há fotos novas.');
        return;
      }
      toast(fresh.length === 1 ? 'A juntar 1 foto…' : `A juntar ${fresh.length} fotos…`);
      for (const item of fresh) {
        await importOne(item);
        done.add(item.id);
        remembered.push(item.id);
        await ctx.store.setMeta(IMPORTED_KEY, remembered.slice(-MAX_REMEMBERED));
      }
    } catch (err) {
      toast(`Não foi possível juntar as fotos: ${err instanceof Error ? err.message : String(err)}`, 6000);
    } finally {
      importing = false;
    }
  }

  async function importOne(item: MediaItem): Promise<void> {
    const takenAt = new Date(item.dateTaken > 0 ? item.dateTaken : item.dateAdded);
    const record = await ctx.photos.addSavedPhoto(
      process,
      division,
      fraction,
      { takenAt, mimeType: item.mime || 'image/jpeg', size: item.size, width: item.width, height: item.height },
      async (folder, fileName) =>
        (await NativePhotos.copy({ uri: item.uri, folder: `${NATIVE_ROOT}/${folder}`, fileName, mime: item.mime || 'image/jpeg' })).path,
    );
    try {
      const [thumb, preview] = await Promise.all([
        NativePhotos.thumbnail({ uri: item.uri, size: 360 }),
        NativePhotos.thumbnail({ uri: item.uri, size: 1280 }),
      ]);
      await ctx.photos.setPreviews(record.id, base64ToBlob(thumb.data, 'image/jpeg'), base64ToBlob(preview.data, 'image/jpeg'));
    } catch {
      /* sem miniatura: a foto já está guardada na pasta */
    }
  }

  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void importNew(false);
  }, 3000);
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void importNew(false);
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  void ctx.store.getMeta<NativeSession>(SESSION_KEY).then((s) => {
    if (disposed || !matches(s)) return;
    session = s;
    showStatus();
    void importNew(false);
  });

  return {
    el,
    dispose: () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      const ending = session;
      if (!ending) return;
      // Última passagem antes de sair desta divisão; depois fecha a sessão (se ninguém abriu outra entretanto).
      void (async () => {
        disposed = false;
        await importNew(false);
        disposed = true;
        const current = await ctx.store.getMeta<NativeSession>(SESSION_KEY);
        if (current?.id === ending.id) await ctx.store.setMeta(SESSION_KEY, null);
      })();
    },
  };
}
