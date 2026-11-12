import type { AppContext } from '../context.ts';
import { MAX_FRACTION_NAME } from '../fractions.ts';
import type { Fraction, Process } from '../types.ts';
import { h, toast } from './dom.ts';

/** Janela para acrescentar uma fração (apartamento) a um processo, antes de escolher a divisão. */
export function openAddFractionDialog(ctx: AppContext, process: Process, onAdded: (fraction: Fraction) => void): void {
  const input = h('input', {
    class: 'field',
    type: 'text',
    placeholder: 'Nome da fração (ex.: Fração A, 1.º Esq.)',
    'aria-label': 'Nome da fração',
    name: 'fracao',
    autocomplete: 'off',
    maxLength: MAX_FRACTION_NAME,
    onkeydown: (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') void submit();
    },
  });
  const dlg = h('dialog', { class: 'photo-dialog small' });
  const close = (): void => dlg.close();

  async function submit(): Promise<void> {
    const fraction = await ctx.fractions.add(process.id, input.value);
    if (!fraction) {
      toast('Indique um nome para a fração (já existe ou está vazio?).');
      return;
    }
    close();
    onAdded(fraction);
  }

  dlg.append(
    h('h2', { class: 'dlg-title' }, 'Nova fração'),
    h(
      'p',
      { class: 'hint' },
      'As fotos desta fração ficam numa pasta com este nome, dentro de “2. Fotos”.',
    ),
    input,
    h(
      'div',
      { class: 'dlg-actions' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => void submit() }, 'Adicionar fração'),
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
