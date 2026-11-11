import type { AppContext } from '../context.ts';
import { summarize, unsentCount } from '../summary.ts';
import { h, toast } from './dom.ts';

/** Botão no topo que mostra o estado das fotos e, ao tocar, repete as que falharam. */
export function createStatusPill(ctx: AppContext): { el: HTMLButtonElement; dispose: () => void } {
  const el = h('button', { class: 'pill', type: 'button', 'aria-live': 'polite' }, 'A carregar…');
  let errors = 0;
  let unsent = 0;
  let disposed = false;

  async function update(): Promise<void> {
    const s = summarize(await ctx.store.list());
    if (disposed) return;
    errors = s.error;
    unsent = unsentCount(s);
    let text: string;
    let tone: string;
    if (ctx.provider.needsNetwork && navigator.onLine === false) {
      text = unsent > 0 ? `Sem rede · ${unsent} por guardar` : 'Sem rede';
      tone = 'warn';
    } else if (s.uploading > 0) {
      text = 'A guardar…';
      tone = 'busy';
    } else if (s.error > 0) {
      text = `${s.error} com erro · tocar para repetir`;
      tone = 'err';
    } else if (s.pending > 0) {
      text = `${s.pending} por guardar`;
      tone = 'busy';
    } else {
      text = 'Tudo guardado';
      tone = 'ok';
    }
    el.textContent = text;
    el.className = `pill ${tone}`;
  }

  el.addEventListener('click', () => {
    if (errors > 0) {
      void retryWithFolder();
    } else if (unsent > 0) {
      void ctx.queue.kick();
      toast(ctx.provider.needsNetwork && navigator.onLine === false ? 'Sem rede: as fotos seguem quando houver ligação.' : 'A guardar…');
    } else {
      toast('Todas as fotos já estão guardadas.');
    }
  });

  /** O toque serve também para autorizar/escolher a pasta (o Android só deixa a partir de um toque). */
  async function retryWithFolder(): Promise<void> {
    try {
      if (ctx.folder && !(await ctx.folder.ensureReady())) {
        toast('Falta escolher ou autorizar a pasta onde guardar as fotos.');
        return;
      }
    } catch (err) {
      toast(`Não foi possível usar a pasta: ${err instanceof Error ? err.message : String(err)}`, 5000);
      return;
    }
    toast('A tentar guardar novamente…');
    await ctx.queue.retryAll();
  }

  const onNetwork = (): void => {
    void update();
  };
  const unsubscribe = ctx.queue.subscribe(onNetwork);
  window.addEventListener('online', onNetwork);
  window.addEventListener('offline', onNetwork);
  void update();

  return {
    el,
    dispose() {
      disposed = true;
      unsubscribe();
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
    },
  };
}
