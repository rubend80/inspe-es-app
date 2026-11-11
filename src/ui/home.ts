import type { AppContext } from '../context.ts';
import { matchesQuery, sortProcessesNewestFirst } from '../processNames.ts';
import { processHash } from '../routes.ts';
import type { PhotoRecord, Process } from '../types.ts';
import { h, toast } from './dom.ts';
import { openNewProcessDialog } from './newProcess.ts';
import { createStatusPill } from './statusPill.ts';
import { createStorageBanner } from './storageBanner.ts';
import { createStoragePanel } from './storagePanel.ts';

/** Quantos processos se mostram sem pesquisa (há centenas por ano; a pesquisa encontra os restantes). */
const MAX_SHOWN = 60;

/** Ecrã inicial: lista de processos (mais recentes primeiro), com pesquisa e o n.º de fotos por guardar de cada um. */
export function mountHome(root: HTMLElement, ctx: AppContext): () => void {
  let disposed = false;
  let loading = true;
  let processes: Process[] = [];
  let photos: PhotoRecord[] = [];

  const pill = createStatusPill(ctx);
  const banner = createStorageBanner(ctx);
  const storagePanel = createStoragePanel(ctx);
  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: 'Procurar por n.º, morada ou cliente…',
    'aria-label': 'Procurar processo por número, morada ou cliente',
    autocomplete: 'off',
    oninput: () => renderList(),
  });
  const note = h('p', { class: 'note', hidden: true });
  const barNum = h('span', { class: 'bar-num' }, '');
  const list = h('ul', { class: 'process-list' });

  const demo = ctx.demo;
  const demoPanel = demo
    ? h(
        'details',
        { class: 'demo' },
        h('summary', null, 'Modo de teste'),
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: demo.isFailureSimulated(),
            onchange: (e: Event) => demo.setFailureSimulated((e.target as HTMLInputElement).checked),
          }),
          ' Simular falha ao guardar',
        ),
        h(
          'p',
          { class: 'hint' },
          'Versão de demonstração: os processos e o envio são de faz de conta. A ligação ao OneDrive vem a seguir.',
        ),
      )
    : null;

  const newButton = ctx.localProcesses
    ? h(
        'button',
        {
          class: 'btn primary new-process',
          type: 'button',
          onclick: () => void openNewProcessDialog(ctx, (p) => (location.hash = processHash(p.id))),
        },
        '+ Novo processo',
      )
    : null;

  root.append(
    h('header', { class: 'topbar' }, h('h1', null, 'Inspeções'), pill.el),
    banner.el,
    h(
      'main',
      { class: 'content' },
      note,
      h('div', { class: 'section-bar' }, barNum, h('span', { class: 'bar-title' }, 'Processos')),
      newButton,
      search,
      list,
      storagePanel,
      demoPanel,
    ),
  );

  function renderList(): void {
    if (disposed) return;
    const query = search.value.trim();
    const unsent = new Map<string, number>();
    for (const p of photos) {
      if (p.status !== 'sent') unsent.set(p.processId, (unsent.get(p.processId) ?? 0) + 1);
    }
    const matching = sortProcessesNewestFirst(processes.filter((p) => matchesQuery(p, query)));
    const shown = matching.slice(0, MAX_SHOWN);
    barNum.textContent = String(processes.length);
    if (shown.length === 0) {
      const text = loading
        ? 'A carregar processos…'
        : processes.length === 0 && ctx.localProcesses
          ? 'Ainda não há processos. Toque em “Novo processo” para criar o primeiro.'
          : 'Nenhum processo encontrado.';
      list.replaceChildren(h('li', { class: 'empty' }, text));
      return;
    }
    const more =
      matching.length > shown.length
        ? h(
            'li',
            { class: 'empty' },
            `A mostrar os ${shown.length} mais recentes de ${matching.length}. Use a pesquisa para encontrar os outros.`,
          )
        : null;
    list.replaceChildren(
      ...shown.map((p) => {
        const n = unsent.get(p.id) ?? 0;
        return h(
          'li',
          null,
          h(
            'a',
            { class: 'process', href: processHash(p.id) },
            h(
              'span',
              { class: 'p-main' },
              h('strong', null, p.name),
              h('small', null, p.client ? `${p.id} · ${p.client}` : p.id),
            ),
            n > 0 ? h('span', { class: 'badge', title: 'Fotos por guardar' }, String(n)) : null,
          ),
        );
      }),
      ...(more ? [more] : []),
    );
  }

  async function refreshPhotos(): Promise<void> {
    const all = await ctx.store.list();
    if (disposed) return;
    photos = all;
    renderList();
  }

  const unsubscribe = ctx.queue.subscribe(() => void refreshPhotos());

  void (async () => {
    try {
      processes = await ctx.cachedProcesses();
      loading = processes.length === 0;
      await refreshPhotos();
      const result = await ctx.loadProcesses();
      if (disposed) return;
      processes = result.processes;
      loading = false;
      if (result.fromCache) {
        note.hidden = false;
        note.textContent =
          processes.length > 0
            ? 'Sem ligação ao servidor: a mostrar a última lista guardada no telemóvel.'
            : 'Ainda não há processos guardados. Ligue-se à rede para os descarregar.';
      } else {
        note.hidden = true;
      }
      renderList();
    } catch (err) {
      loading = false;
      renderList();
      toast(`Não foi possível carregar os processos: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();

  return () => {
    disposed = true;
    unsubscribe();
    pill.dispose();
    banner.dispose();
  };
}
