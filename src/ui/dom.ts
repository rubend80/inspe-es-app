export type Child = Node | string | number | null | undefined | false;
export type Props = Record<string, unknown>;

// Atributos que não se podem (ou não convém) definir como propriedade do elemento.
const ATTRIBUTE_ONLY = new Set(['list', 'role', 'style', 'for', 'form']);

export function append(parent: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.append(typeof c === 'object' ? c : String(c));
  }
}

/** Cria um elemento: h('button', { class: 'x', onclick: fn }, 'texto', outroElemento). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') {
        el.className = String(value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key.startsWith('aria-') || key.startsWith('data-') || ATTRIBUTE_ONLY.has(key)) {
        el.setAttribute(key, String(value));
      } else if (key in el) {
        (el as unknown as Record<string, unknown>)[key] = value;
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

/** Mensagem curta no fundo do ecrã. */
export function toast(message: string, ms = 3000): void {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

/** Preferências pequenas (ex.: última divisão usada). Nunca falha, mesmo sem localStorage. */
export function readPref(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function writePref(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignora */
  }
}
