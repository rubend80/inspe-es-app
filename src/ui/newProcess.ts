import type { AppContext } from '../context.ts';
import { buildLocalProcess, MAX_ADDRESS, MAX_CLIENT } from '../localProcesses.ts';
import type { Process } from '../types.ts';
import { h } from './dom.ts';

function labelled(text: string, input: HTMLElement): HTMLElement {
  return h('label', { class: 'field-label' }, text, input);
}

/** Formulário para criar um processo no telemóvel: n.º, morada e (opcional) cliente. */
export async function openNewProcessDialog(ctx: AppContext, onCreated: (process: Process) => void): Promise<void> {
  const processes = ctx.localProcesses;
  if (!processes) return;
  const existing = await processes.list();
  const yy = String(new Date().getFullYear()).slice(-2);

  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const preview = h('p', { class: 'hint folder-preview' }, 'A pasta fica com o nome “n.º - morada - cliente”.');

  const idInput = h('input', {
    class: 'field',
    type: 'text',
    inputMode: 'numeric',
    maxLength: 8,
    placeholder: `ex.: ${yy}0098`,
    autocomplete: 'off',
    name: 'processo',
  });
  const addressInput = h('input', {
    class: 'field',
    type: 'text',
    maxLength: MAX_ADDRESS,
    placeholder: 'ex.: Praça de Portugal 7 Odivelas',
    autocomplete: 'off',
    name: 'morada',
  });
  const clientInput = h('input', {
    class: 'field',
    type: 'text',
    maxLength: MAX_CLIENT,
    placeholder: 'ex.: Ana Exemplo',
    autocomplete: 'off',
    name: 'cliente',
    onkeydown: (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') void submit();
    },
  });

  const dlg = h('dialog', { class: 'photo-dialog small' });
  const close = (): void => dlg.close();

  function refreshPreview(): void {
    error.hidden = true;
    const result = buildLocalProcess({ id: idInput.value, address: addressInput.value, client: clientInput.value }, existing);
    preview.textContent = result.ok ? `Pasta: ${result.process.folder}` : 'A pasta fica com o nome “n.º - morada - cliente”.';
  }
  for (const input of [idInput, addressInput, clientInput]) input.addEventListener('input', refreshPreview);

  async function submit(): Promise<void> {
    const result = await processes!.add({ id: idInput.value, address: addressInput.value, client: clientInput.value });
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
    labelled('Número do processo', idInput),
    labelled('Morada', addressInput),
    labelled('Cliente (opcional)', clientInput),
    preview,
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
