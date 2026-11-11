import type { AppContext } from '../context.ts';
import { formatDateTime, formatResolution, formatSize, STATUS_LABEL } from '../format.ts';
import { h, toast } from './dom.ts';

/** Detalhe de uma foto: pré-visualização, estado, e ações (repetir / eliminar). */
export async function openPhotoDialog(ctx: AppContext, id: string): Promise<void> {
  const photo = await ctx.store.get(id);
  if (!photo) return;

  let url: string | null = null;
  const source = photo.blob ?? photo.preview ?? photo.thumb; // depois do envio só resta a pré-visualização
  let preview: HTMLElement;
  if (source) {
    url = URL.createObjectURL(source);
    preview = h('img', { class: 'dlg-img', src: url, alt: photo.fileName });
  } else {
    preview = h('div', { class: 'dlg-img ph' }, 'Sem pré-visualização');
  }

  const dlg = h('dialog', { class: 'photo-dialog' });
  const close = (): void => dlg.close();

  const rows: [string, string][] = [
    ['Ficheiro', photo.fileName],
    ['Tirada em', formatDateTime(photo.takenAt)],
    ...(photo.fractionName ? ([['Fração', photo.fractionName]] as [string, string][]) : []),
    ['Divisão', photo.divisionName || '—'],
    ['Tamanho', formatSize(photo.size)],
  ];
  if (photo.width && photo.height) rows.push(['Resolução', formatResolution(photo.width, photo.height)]);
  rows.push(['Estado', STATUS_LABEL[photo.status]]);
  if (photo.remotePath) rows.push(['Original em', photo.remotePath]);
  if (photo.lightRemotePath) {
    rows.push(['Versão leve em', photo.lightSize ? `${photo.lightRemotePath} (${formatSize(photo.lightSize)})` : photo.lightRemotePath]);
  }
  if (photo.status === 'error' && photo.lastError) rows.push(['Erro', photo.lastError]);

  const actions: HTMLElement[] = [];
  if (photo.status === 'error') {
    actions.push(
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: () => {
            close();
            void ctx.queue.retry(photo.id);
          },
        },
        'Tentar novamente',
      ),
    );
  }
  if (photo.status === 'pending' || photo.status === 'error') {
    actions.push(
      h(
        'button',
        {
          class: 'btn danger',
          type: 'button',
          onclick: async () => {
            if (!confirm('Eliminar esta foto? Ainda não foi guardada na pasta e não a poderá recuperar.')) return;
            const ok = await ctx.photos.deletePhoto(photo.id);
            close();
            if (!ok) toast('Não foi possível eliminar a foto.');
          },
        },
        'Eliminar',
      ),
    );
  }
  actions.push(h('button', { class: 'btn', type: 'button', onclick: close }, 'Fechar'));

  dlg.append(
    preview,
    h('dl', { class: 'dlg-info' }, ...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
    h('div', { class: 'dlg-actions' }, ...actions),
  );
  dlg.addEventListener('close', () => {
    if (url) URL.revokeObjectURL(url);
    dlg.remove();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close(); // toque fora da caixa fecha
  });

  document.body.append(dlg);
  dlg.showModal();
}
