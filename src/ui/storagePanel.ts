import type { AppContext } from '../context.ts';
import { h, toast } from './dom.ts';

/** "Onde ficam as fotos": mostra a pasta em uso e deixa escolher outra. Só existe quando se guarda no telemóvel. */
export function createStoragePanel(ctx: AppContext): HTMLElement | null {
  const folder = ctx.folder;
  if (!folder) return null;

  const info = h('p', { class: 'hint' }, '…');
  const button = h('button', { class: 'btn', type: 'button', hidden: true });
  const panel = h('details', { class: 'demo storage' }, h('summary', null, 'Onde ficam as fotos'), info, button);

  async function refresh(): Promise<void> {
    const state = await folder!.state();
    const label = await folder!.label();
    if (folder!.kind === 'picked') {
      info.textContent =
        state === 'none'
          ? 'Ainda não escolheu a pasta. Escolha uma pasta do telemóvel (por exemplo, uma pasta “Inspeções” dentro de Documentos).'
          : `Pasta do telemóvel: “${label}”. Dentro dela, cada processo tem as suas pastas “2. Fotos” e “3. Fotos - Light”.`;
      button.textContent = state === 'none' ? 'Escolher pasta' : 'Escolher outra pasta';
      button.hidden = false;
    } else {
      info.textContent =
        'As fotos ficam na memória interna da app (não aparecem no gestor de ficheiros do telemóvel). ' +
        'Para as ter numa pasta do telemóvel é preciso um Chrome para Android atualizado.';
      button.hidden = true;
    }
  }

  button.addEventListener('click', () => {
    void (async () => {
      try {
        if (await folder.choose()) {
          toast('Pasta escolhida. A guardar as fotos…');
          await ctx.queue.retryAll();
        }
      } catch (err) {
        toast(`Não foi possível usar essa pasta: ${err instanceof Error ? err.message : String(err)}`, 5000);
      }
      await refresh();
    })();
  });

  void refresh();
  return panel;
}
