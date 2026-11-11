import type { AppContext } from '../context.ts';
import { DIVISION_SUGGESTIONS } from '../divisions.ts';
import { formatPhotoCount } from '../format.ts';
import { inFraction } from '../fractions.ts';
import { divisionHash, homeHash, processHash } from '../routes.ts';
import { summarize, unsentCount } from '../summary.ts';
import type { Division, Fraction, PhotoRecord, Process } from '../types.ts';
import { openAddFractionDialog } from './addFraction.ts';
import { h, toast } from './dom.ts';
import { createStatusPill } from './statusPill.ts';
import { createStorageBanner } from './storageBanner.ts';

/**
 * Ecrã do processo: primeiro as frações (se o imóvel as tiver), depois as divisões.
 * Tocar numa divisão abre a câmara já dentro dessa pasta (e dessa fração, se houver).
 */
export function mountProcess(root: HTMLElement, ctx: AppContext, process: Process, fraction?: Fraction): () => void {
  let disposed = false;
  let divisions: Division[] = [];
  let fractions: Fraction[] = [];
  let photos: PhotoRecord[] = [];

  const pill = createStatusPill(ctx);
  const banner = createStorageBanner(ctx);
  const removeSlot = h('div', { class: 'remove-slot' });
  const photoSummary = h('dd', null, '—');
  const fractionNum = h('span', { class: 'bar-num' }, '0');
  const chips = h('div', { class: 'chips' });
  const fractionHint = h('p', { class: 'hint' });
  const barNum = h('span', { class: 'bar-num' }, '');
  const barTitle = h('span', { class: 'bar-title' }, 'Divisões');
  const tiles = h('div', { class: 'tile-grid' });

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
        h('dt', null, 'Local:'),
        h('dd', null, process.name),
        ...(process.client ? [h('dt', null, 'Cliente:'), h('dd', null, process.client)] : []),
        h('dt', null, 'Fotos:'),
        photoSummary,
      ),
      h('div', { class: 'section-bar' }, fractionNum, h('span', { class: 'bar-title' }, 'Frações')),
      chips,
      fractionHint,
      h('div', { class: 'section-bar' }, barNum, barTitle),
      tiles,
      removeSlot,
    ),
  );

  function render(): void {
    if (disposed) return;
    const perDivision = new Map<string, { total: number; unsent: number }>();
    for (const p of photos) {
      if (!inFraction(p, fraction?.id)) continue;
      const entry = perDivision.get(p.divisionId) ?? { total: 0, unsent: 0 };
      entry.total += 1;
      if (p.status !== 'sent') entry.unsent += 1;
      perDivision.set(p.divisionId, entry);
    }

    const unsent = unsentCount(summarize(photos));
    barNum.textContent = String(divisions.length);
    barTitle.textContent = fraction ? `Divisões · ${fraction.name}` : 'Divisões';
    renderFractions();
    photoSummary.textContent =
      photos.length === 0
        ? 'Ainda sem fotos'
        : `${formatPhotoCount(photos.length)} · ${unsent > 0 ? `${unsent} por guardar` : 'tudo guardado'}`;

    tiles.replaceChildren(
      ...divisions.map((d) => {
        const entry = perDivision.get(d.id);
        return h(
          'a',
          { class: `tile${entry ? ' has-photos' : ''}`, href: divisionHash(process.id, d.id, fraction?.id) },
          // espaço sem quebra antes do número final: "Casa de banho 1" nunca deixa o "1" sozinho numa linha
          h('span', { class: 't-name' }, d.name.replace(/ (\d+)$/, ' $1')),
          entry
            ? h('span', { class: 't-count' }, h('b', null, String(entry.total)), entry.total === 1 ? ' foto' : ' fotos')
            : h('span', { class: 't-count none' }, 'Sem fotos'),
          entry && entry.unsent > 0
            ? h('span', { class: 'badge', title: 'Fotos por guardar' }, String(entry.unsent))
            : null,
        );
      }),
      h(
        'button',
        { class: 'tile add', type: 'button', onclick: () => openAddDialog() },
        h('span', { class: 't-plus' }, '+'),
        h('span', { class: 't-name' }, 'Outra divisão'),
      ),
    );

    // Engano ao criar o processo (n.º ou morada errados)? Enquanto não tiver fotos, pode tirá-lo da lista.
    const fractionHasPhotos = fraction ? photos.some((p) => inFraction(p, fraction.id)) : false;
    removeSlot.replaceChildren(
      ...(fraction && !fractionHasPhotos
        ? [
            h(
              'button',
              {
                class: 'btn danger',
                type: 'button',
                onclick: () => {
                  if (!confirm(`Remover a fração “${fraction.name}” da lista? Ainda não tem fotos.`)) return;
                  void ctx.fractions.remove(process.id, fraction.id).then((ok) => {
                    if (ok) location.replace(processHash(process.id));
                    else toast('Esta fração já tem fotos e não pode ser removida.');
                  });
                },
              },
              'Remover esta fração',
            ),
          ]
        : []),
      ...(ctx.localProcesses && photos.length === 0 && fractions.length === 0
        ? [
            h(
              'button',
              {
                class: 'btn danger',
                type: 'button',
                onclick: () => {
                  if (!confirm(`Remover o processo ${process.id} da lista? Ainda não tem fotos.`)) return;
                  void ctx.localProcesses?.remove(process.id).then(() => location.replace(homeHash()));
                },
              },
              'Remover este processo da lista',
            ),
          ]
        : []),
    );
  }

  /** "Sem fração" + as frações do processo + "+ Fração". Mudar de fração não deixa passos no botão Voltar. */
  function renderFractions(): void {
    fractionNum.textContent = String(fractions.length);
    const countIn = (id?: string): number => photos.filter((p) => inFraction(p, id)).length;
    const chip = (label: string, id: string | undefined, active: boolean): HTMLElement => {
      const n = countIn(id);
      const target = processHash(process.id, id);
      return h(
        'a',
        {
          class: `chip${active ? ' on' : ''}`,
          href: target,
          'aria-current': active ? 'true' : null,
          onclick: (e: Event) => {
            e.preventDefault();
            if (!active) location.replace(target);
          },
        },
        h('span', null, label),
        n > 0 ? h('b', null, String(n)) : null,
      );
    };
    const addChip = h(
      'button',
      { class: 'chip add', type: 'button', onclick: () => openAddFractionDialog(ctx, process, (f) => location.replace(processHash(process.id, f.id))) },
      '+ Fração',
    );
    chips.replaceChildren(
      ...(fractions.length > 0
        ? [chip('Sem fração', undefined, !fraction), ...fractions.map((f) => chip(f.name, f.id, f.id === fraction?.id))]
        : []),
      addChip,
    );
    fractionHint.textContent =
      fractions.length === 0
        ? 'Prédio com várias frações? Adicione-as aqui, antes de escolher a divisão. Sem frações, as fotos ficam logo nas divisões.'
        : fraction
          ? `As fotos ficam em “2. Fotos / ${fraction.folder} / <divisão>”.`
          : 'Sem fração: as fotos ficam logo em “2. Fotos / <divisão>”.';
  }

  async function refresh(): Promise<void> {
    const [list, fracs, all] = await Promise.all([
      ctx.divisions.list(process.id),
      ctx.fractions.list(process.id),
      ctx.store.listByProcess(process.id),
    ]);
    if (disposed) return;
    divisions = list;
    fractions = fracs;
    photos = all;
    render();
  }

  /** Para o que não está na lista (fachada, cobertura, varanda...). */
  function openAddDialog(): void {
    const input = h('input', {
      class: 'field',
      type: 'text',
      placeholder: 'Nome da divisão (ex.: Varanda)',
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
      const division = await ctx.divisions.add(process.id, input.value);
      if (!division) {
        toast('Indique um nome para a divisão.');
        return;
      }
      close();
      location.hash = divisionHash(process.id, division.id, fraction?.id);
    }

    dlg.append(
      h('h2', { class: 'dlg-title' }, 'Outra divisão'),
      h('p', { class: 'hint' }, 'Para o que não está na lista: fachada, cobertura, varanda…'),
      input,
      h('datalist', { id: 'division-suggestions' }, ...DIVISION_SUGGESTIONS.map((s) => h('option', { value: s }))),
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
