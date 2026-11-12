import type { AppContext } from '../context.ts';
import { inFraction } from '../fractions.ts';
import { divisionsHash, processHash } from '../routes.ts';
import type { Fraction, PhotoRecord, Process } from '../types.ts';
import { openAddFractionDialog } from './addFraction.ts';
import { h } from './dom.ts';
import { createStatusPill } from './statusPill.ts';
import { createStorageBanner } from './storageBanner.ts';

/** Lista das frações do processo, todas acrescentadas à mão. */
export function mountFractions(root: HTMLElement, ctx: AppContext, process: Process): () => void {
  let disposed = false;
  let fractions: Fraction[] = [];
  let photos: PhotoRecord[] = [];

  const pill = createStatusPill(ctx);
  const banner = createStorageBanner(ctx);
  const barNum = h('span', { class: 'bar-num' }, '0');
  const tiles = h('div', { class: 'tile-grid' });

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'back', href: processHash(process.id), 'aria-label': 'Voltar ao processo' }, '←'),
      h('div', { class: 'title-block' }, h('small', null, `Processo ${process.id}`), h('strong', null, 'Frações')),
      pill.el,
    ),
    banner.el,
    h(
      'main',
      { class: 'content' },
      h('div', { class: 'section-bar' }, barNum, h('span', { class: 'bar-title' }, 'Frações')),
      tiles,
    ),
  );

  function render(): void {
    if (disposed) return;
    barNum.textContent = String(fractions.length);
    tiles.replaceChildren(
      ...fractions.map((f) => {
        const n = photos.filter((p) => inFraction(p, f.id)).length;
        return h(
          'a',
          { class: `tile${n > 0 ? ' has-photos' : ''}`, href: divisionsHash(process.id, f.id) },
          h('span', { class: 't-name' }, f.name),
          n > 0
            ? h('span', { class: 't-count' }, h('b', null, String(n)), n === 1 ? ' foto' : ' fotos')
            : h('span', { class: 't-count none' }, 'Sem fotos'),
        );
      }),
      h(
        'button',
        {
          class: 'tile add',
          type: 'button',
          onclick: () => openAddFractionDialog(ctx, process, (f) => (location.hash = divisionsHash(process.id, f.id))),
        },
        h('span', { class: 't-plus' }, '+'),
        h('span', { class: 't-name' }, 'Adicionar fração'),
      ),
    );
  }

  async function refresh(): Promise<void> {
    const [fracs, all] = await Promise.all([ctx.fractions.list(process.id), ctx.store.listByProcess(process.id)]);
    if (disposed) return;
    fractions = fracs;
    photos = all;
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
