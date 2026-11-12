import type { AppContext } from '../context.ts';
import { formatPhotoCount } from '../format.ts';
import { isNativeApp } from '../native/nativePhotos.ts';
import { COMMON_AREA, inFraction } from '../fractions.ts';
import { divisionsHash, fractionsHash, homeHash } from '../routes.ts';
import { summarize, unsentCount } from '../summary.ts';
import type { Fraction, PhotoRecord, Process } from '../types.ts';
import { h } from './dom.ts';
import { createStatusPill } from './statusPill.ts';
import { createStorageBanner } from './storageBanner.ts';

/** Ecrã do processo: escolher Espaços comuns, Frações ou Fração única. */
export function mountProcess(root: HTMLElement, ctx: AppContext, process: Process): () => void {
  let disposed = false;
  let photos: PhotoRecord[] = [];
  let fractions: Fraction[] = [];

  const pill = createStatusPill(ctx);
  const banner = createStorageBanner(ctx);
  const photoSummary = h('dd', null, '—');
  const options = h('div', { class: 'part-list' });
  const removeSlot = h('div', { class: 'remove-slot' });

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'back', href: homeHash(), 'aria-label': 'Voltar aos processos' }, '←'),
      h('div', { class: 'title-block' }, h('small', null, 'Processo'), h('strong', null, process.id)),
      pill.el,
    ),
    banner.el,
    h(
      'main',
      { class: 'content' },
      h(
        'dl',
        { class: 'info' },
        ...(process.name && process.name !== process.id ? [h('dt', null, 'Local:'), h('dd', null, process.name)] : []),
        h('dt', null, 'Fotos:'),
        photoSummary,
      ),
      options,
      removeSlot,
    ),
  );

  function part(title: string, detail: string, href: string, count: number): HTMLElement {
    return h(
      'a',
      { class: `part${count > 0 ? ' has-photos' : ''}`, href },
      h('span', { class: 'part-text' }, h('strong', null, title), h('small', null, detail)),
      h('span', { class: 'part-count' }, count > 0 ? formatPhotoCount(count) : 'Sem fotos'),
    );
  }

  function render(): void {
    if (disposed) return;
    const unsent = unsentCount(summarize(photos));
    photoSummary.textContent =
      photos.length === 0
        ? 'Ainda sem fotos'
        : `${formatPhotoCount(photos.length)} · ${unsent > 0 ? `${unsent} por guardar` : 'tudo guardado'}`;
    const common = photos.filter((p) => inFraction(p, COMMON_AREA.id)).length;
    const single = photos.filter((p) => inFraction(p)).length;
    const inFractions = photos.length - common - single;
    options.replaceChildren(
      part('Espaços comuns', 'Fachada, cobertura, terraço, garagem…', divisionsHash(process.id, COMMON_AREA.id), common),
      part(
        'Frações',
        fractions.length === 0 ? 'Prédio: adicionar cada fração' : fractions.map((f) => f.name).join(', '),
        fractionsHash(process.id),
        inFractions,
      ),
      part('Fração única', 'Moradia ou um só apartamento', divisionsHash(process.id), single),
    );
    removeSlot.replaceChildren(
      ...(ctx.localProcesses
        ? [h('button', { class: 'btn danger', type: 'button', onclick: () => void deleteProcess() }, 'Eliminar processo')]
        : []),
    );
  }

  /** Tira o processo da app (lista, fotos registadas, frações e divisões). Os ficheiros já guardados ficam no telemóvel. */
  async function deleteProcess(): Promise<void> {
    const unsent = photos.filter((p) => p.status !== 'sent').length;
    const saved = photos.length - unsent;
    const lines = [`Eliminar o processo ${process.id} da app?`];
    if (saved > 0) {
      lines.push(`${formatPhotoCount(saved)} já guardada${saved === 1 ? '' : 's'} continua${saved === 1 ? '' : 'm'} no telemóvel, na pasta ${isNativeApp() ? `Documents/Inspeções/${process.folder}` : `do processo (${process.folder})`}.`);
    }
    if (unsent > 0) lines.push(`Atenção: ${formatPhotoCount(unsent)} ainda não ${unsent === 1 ? 'foi guardada e perde-se' : 'foram guardadas e perdem-se'}.`);
    if (!confirm(lines.join('\n\n'))) return;
    for (const p of await ctx.store.listByProcess(process.id)) await ctx.store.remove(p.id);
    for (const key of [`divisions:${process.id}`, `divisions-common:${process.id}`, `fractions:${process.id}`, `imported:${process.id}`]) {
      await ctx.store.setMeta(key, null);
    }
    await ctx.localProcesses?.remove(process.id);
    ctx.queue.notify();
    location.replace(homeHash());
  }

  async function refresh(): Promise<void> {
    const [all, fracs] = await Promise.all([ctx.store.listByProcess(process.id), ctx.fractions.list(process.id)]);
    if (disposed) return;
    photos = all;
    fractions = fracs;
    render();
  }

  const unsubscribe = ctx.queue.subscribe(() => void refresh());
  void refresh();

  return () => {
    disposed = true;
    unsubscribe();
    pill.dispose();
    banner.dispose();
  };
}
