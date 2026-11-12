import type { AppContext } from '../context.ts';
import type { Process } from '../types.ts';
import { h } from './dom.ts';

/** Formulário para criar um processo no telemóvel: só o número. */
export async function openNewProcessDialog(ctx: AppContext, onCreated: (process: Process) => void): Promise<void> {
  const processes = ctx.localProcesses;
  if (!processes) return;
  const yy = String(new Date().getFullYear()).slice(-2);

  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const idInput = h('input', {
    class: 'field',
    type: 'text',
    inputMode: 'numeric',
    maxLength: 8,
    placeholder: `ex.: ${yy}0098`,
    autocomplete: 'off',
    name: 'processo',
    oninput: () => (error.hidden = true),
    onkeydown: (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') void submit();
    },
  });

  const dlg = h('dialog', { class: 'photo-dialog small' });
  const close = (): void => dlg.close();

  async function submit(): Promise<void> {
    const result = await processes!.add({ id: idInput.value });
    if (!result.ok) {
      error.textContent = result.error;
      error.hidden = false;
      return;
    }
    close();
    onCreated(result.process);
  }

  dlg.append(
    h('h2', { class: 'dlg-title' }, 'Novo processo'),
    h('label', { class: 'field-label' }, 'Número do processo', idInput),
    error,
    h(
      'div',
      { class: 'dlg-actions' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => void submit() }, 'Criar processo'),
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancelar'),
    ),
  );
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });
  document.body.append(dlg);
  dlg.showModal();
  idInput.focus();
}
