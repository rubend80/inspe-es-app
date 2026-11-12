import type { AppContext } from '../context.ts';
import { DIVISION_SUGGESTIONS } from '../divisions.ts';
import { inFraction, scopeOf } from '../fractions.ts';
import { divisionHash, fractionsHash, processHash } from '../routes.ts';
import type { Division, Fraction, PhotoRecord, Process } from '../types.ts';
import { h, toast } from './dom.ts';
import { createStatusPill } from './statusPill.ts';
import { createStorageBanner } from './storageBanner.ts';

/**
 * Divisões de uma parte do processo: dos espaços comuns, de uma fração ou da fração única (fraction ausente).
 * Tocar numa divisão abre a câmara já dentro dessa pasta.
 */
export function mountDivisions(root: HTMLElement, ctx: AppContext, process: Process, fraction?: Fraction): () => void {
  let disposed = false;
  let divisions: Division[] = [];
  let photos: PhotoRecord[] = [];
  const scope = scopeOf(fraction);
  const isCommon = scope === 'common';
  const title = fraction ? fraction.name : 'Fração única';
  // Voltar: de uma fração volta à lista das frações; dos espaços comuns e da fração única volta ao processo.
  const backHref = fraction && !isCommon ? fractionsHash(process.id) : processHash(process.id);

  const pill = createStatusPill(ctx);
  const banner = createStorageBanner(ctx);
  const removeSlot = h('div', { class: 'remove-slot' });
  const barNum = h('span', { class: 'bar-num' }, '');
  const tiles = h('div', { class: 'tile-grid' });
  const where = fraction ? `2. Fotos / ${fraction.folder} / <divisão>` : '2. Fotos / <divisão>';

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'back', href: backHref, 'aria-label': 'Voltar' }, '←'),
      h('div', { class: 'title-block' }, h('small', null, `Processo ${process.id}`), h('strong', null, title)),
      pill.el,
    ),
    banner.el,
    h(
      'main',
      { class: 'content' },
      h('div', { class: 'section-bar' }, barNum, h('span', { class: 'bar-title' }, 'Divisões')),
      h('p', { class: 'hint' }, `As fotos ficam em “${where}”.`),
      tiles,
      removeSlot,
    ),
  );

  function render(): void {
    if (disposed) return;
    const mine = photos.filter((p) => inFraction(p, fraction?.id));
    const perDivision = new Map<string, { total: number; unsent: number }>();
    for (const p of mine) {
      const entry = perDivision.get(p.divisionId) ?? { total: 0, unsent: 0 };
      entry.total += 1;
      if (p.status !== 'sent') entry.unsent += 1;
      perDivision.set(p.divisionId, entry);
    }
    barNum.textContent = String(divisions.length);
    tiles.replaceChildren(
      ...divisions.map((d) => {
        const entry = perDivision.get(d.id);
        return h(
          'a',
          { class: `tile${entry ? ' has-photos' : ''}`, href: divisionHash(process.id, d.id, fraction?.id) },
          // espaço sem quebra antes do número final: "Quarto 1" nunca deixa o "1" sozinho numa linha
          h('span', { class: 't-name' }, d.name.replace(/ (\d+)$/, ' $1')),
          entry
            ? h('span', { class: 't-count' }, h('b', null, String(entry.total)), entry.total === 1 ? ' foto' : ' fotos')
            : h('span', { class: 't-count none' }, 'Sem fotos'),
          entry && entry.unsent > 0 ? h('span', { class: 'badge', title: 'Fotos por guardar' }, String(entry.unsent)) : null,
        );
      }),
      h(
        'button',
        { class: 'tile add', type: 'button', onclick: () => openAddDialog() },
        h('span', { class: 't-plus' }, '+'),
        h('span', { class: 't-name' }, isCommon ? 'Outro espaço' : 'Outra divisão'),
      ),
    );

    // Fração criada por engano: enquanto não tiver fotos, pode ser removida.
    removeSlot.replaceChildren(
      ...(fraction && !isCommon && mine.length === 0
        ? [
            h(
              'button',
              {
                class: 'btn danger',
                type: 'button',
                onclick: () => {
                  if (!confirm(`Remover a fração “${fraction.name}”? Ainda não tem fotos.`)) return;
                  void ctx.fractions.remove(process.id, fraction.id).then((ok) => {
                    if (ok) location.replace(fractionsHash(process.id));
                    else toast('Esta fração já tem fotos e não pode ser removida.');
                  });
                },
              },
              'Remover esta fração',
            ),
          ]
        : []),
    );
  }

  async function refresh(): Promise<void> {
    const [list, all] = await Promise.all([ctx.divisions.list(process.id, scope), ctx.store.listByProcess(process.id)]);
    if (disposed) return;
    divisions = list;
    photos = all;
    render();
  }

  /** Para o que não está na lista. */
  function openAddDialog(): void {
    const input = h('input', {
      class: 'field',
      type: 'text',
      placeholder: isCommon ? 'Nome (ex.: Escadas)' : 'Nome da divisão (ex.: Varanda)',
      'aria-label': 'Nome da divisão',
      list: 'division-suggestions',
      autocomplete: 'off',
      maxLength: 40,
      onkeydown: (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter') void submit();
      },
    });
    const dlg = h('dialog', { class: 'photo-dialog small' });
    const close = (): void => dlg.close();

    async function submit(): Promise<void> {
      const division = await ctx.divisions.add(process.id, input.value, scope);
      if (!division) {
        toast('Indique um nome para a divisão.');
        return;
      }
      close();
      location.hash = divisionHash(process.id, division.id, fraction?.id);
    }

    dlg.append(
      h('h2', { class: 'dlg-title' }, isCommon ? 'Outro espaço comum' : 'Outra divisão'),
      input,
      h('datalist', { id: 'division-suggestions' }, ...DIVISION_SUGGESTIONS[scope].map((s) => h('option', { value: s }))),
      h(
        'div',
        { class: 'dlg-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => void submit() }, 'Adicionar e fotografar'),
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'),
      ),
    );
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) close();
    });
    document.body.append(dlg);
    dlg.showModal();
    input.focus();
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
