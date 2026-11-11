import type { AppContext } from '../context.ts';
import { h, toast } from './dom.ts';

/**
 * Aviso no topo dos ecrãs quando a pasta de fotos precisa de atenção:
 * ainda não foi escolhida, ou o Android pede para voltar a autorizar.
 * Só aparece nesses casos; com a pasta pronta fica escondido.
 */
export function createStorageBanner(ctx: AppContext): { el: HTMLElement; dispose: () => void } {
  const text = h('span', { class: 'banner-text' });
  const button = h('button', { class: 'btn primary', type: 'button' });
  const el = h('div', { class: 'banner', role: 'status', hidden: true }, text, button);
  let disposed = false;

  async function update(): Promise<void> {
    const folder = ctx.folder;
    if (!folder) {
      el.hidden = true;
      return;
    }
    const state = await folder.state();
    if (disposed) return;
    el.hidden = state === 'ready' && !folder.degraded;
    button.hidden = false;
    if (state === 'ready' && folder.degraded) {
      text.textContent =
        'Este Chrome ainda não deixa escolher uma pasta: as fotos ficam só dentro da app e não aparecem nos Ficheiros. Atualize o Chrome.';
      button.hidden = true;
    } else if (state === 'none') {
      text.textContent = 'Escolha a pasta do telemóvel onde guardar as fotos. Até lá, as fotos ficam guardadas na app.';
      button.textContent = 'Escolher pasta';
    } else if (state === 'needs-permission') {
      const label = await folder.label();
      if (disposed) return;
      text.textContent = `O Android pede autorização para voltar a guardar na pasta “${label}”.`;
      button.textContent = 'Autorizar';
    } else if (state === 'unsupported') {
      text.textContent = 'Este navegador não consegue guardar as fotos numa pasta. Use o Chrome atualizado.';
      button.hidden = true;
    }
  }

  button.addEventListener('click', () => {
    void (async () => {
      try {
        if (ctx.folder && (await ctx.folder.ensureReady())) {
          toast('Pasta pronta. A guardar as fotos…');
          await ctx.queue.retryAll();
        }
      } catch (err) {
        toast(`Não foi possível usar a pasta: ${err instanceof Error ? err.message : String(err)}`, 5000);
      }
      await update();
    })();
  });

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void update();
  };
  document.addEventListener('visibilitychange', onVisible);
  const unsubscribe = ctx.queue.subscribe(() => void update());
  void update();

  return {
    el,
    dispose() {
      disposed = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
