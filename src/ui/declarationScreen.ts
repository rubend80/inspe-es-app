import type { AppContext } from '../context.ts';
import {
  CAPACITY_LABEL,
  declarationFileName,
  declarationTokens,
  hhmm,
  isoDate,
  missingFields,
  OTHER_DATA_SUBFOLDER,
  placeAndDate,
} from '../declaration.ts';
import type { Capacity, DeclarationData, Token } from '../declaration.ts';
import { jpegToPdf } from '../pdf.ts';
import { processHash } from '../routes.ts';
import type { Process } from '../types.ts';
import { h, readPref, toast, writePref } from './dom.ts';

export const declarationKey = (processId: string): string => `declaration:${processId}`;
const TECH_SIGNATURE_PREF = 'tech-signature';

/** O que fica guardado na app sobre a última declaração do processo. */
export interface SavedDeclaration {
  path: string;
  savedAt: number;
  name: string;
  extra: string;
  capacity: Capacity;
  address: string;
  place: string;
}

// ---------------- Assinatura no ecrã ----------------

interface SignaturePad {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  isEmpty(): boolean;
  clear(): void;
  load(dataUrl: string): void;
  toDataUrl(): string;
}

function createSignaturePad(label: string): SignaturePad {
  const canvas = h('canvas', { class: 'sig-canvas', 'aria-label': label });
  let empty = true;
  let drawing = false;
  let last: { x: number; y: number } | null = null;

  const g = (): CanvasRenderingContext2D => canvas.getContext('2d') as CanvasRenderingContext2D;
  function fit(): void {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    const keep = empty ? null : canvas.toDataURL();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    if (keep) pad.load(keep);
  }
  const point = (e: PointerEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (canvas.width === 0) fit();
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    last = point(e);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || !last) return;
    const p = point(e);
    const c = g();
    c.strokeStyle = '#10235e';
    c.lineWidth = Math.max(2, canvas.width / 220);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(last.x, last.y);
    c.lineTo(p.x, p.y);
    c.stroke();
    last = p;
    empty = false;
    e.preventDefault();
  });
  const stop = (): void => {
    drawing = false;
    last = null;
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  const pad: SignaturePad = {
    canvas,
    el: h(
      'div',
      { class: 'sig' },
      h('div', { class: 'sig-head' }, h('span', null, label), h('button', { class: 'link-btn', type: 'button', onclick: () => pad.clear() }, 'Apagar')),
      canvas,
    ),
    isEmpty: () => empty,
    clear: () => {
      g().clearRect(0, 0, canvas.width, canvas.height);
      empty = true;
    },
    load: (dataUrl: string) => {
      const img = new Image();
      img.onload = () => {
        if (canvas.width === 0) fit();
        const c = g();
        c.clearRect(0, 0, canvas.width, canvas.height);
        const s = Math.min(canvas.width / img.width, canvas.height / img.height);
        c.drawImage(img, (canvas.width - img.width * s) / 2, (canvas.height - img.height * s) / 2, img.width * s, img.height * s);
        empty = false;
      };
      img.src = dataUrl;
    },
    toDataUrl: () => canvas.toDataURL('image/png'),
  };
  requestAnimationFrame(fit);
  return pad;
}

// ---------------- Desenho da página (modelo da LiveHouse) ----------------

const PAGE_W = 1654; // A4 a 200 ppp
const PAGE_H = 2339;
const FONT = '"Century Gothic", "Avenir Next", Avenir, "Segoe UI", Roboto, Arial, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

interface Word {
  text: string;
  bold: boolean;
  box?: boolean | undefined;
  /** Quadrado colado a seguir ao texto ("Representante ☐"): nunca ficam separados numa mudança de linha. */
  trailingBox?: boolean;
  width: number;
  spaceAfter: boolean;
}

function layoutWords(c: CanvasRenderingContext2D, tokens: Token[], size: number): Word[] {
  const words: Word[] = [];
  const font = (bold: boolean): string => `${bold ? '700' : '400'} ${size}px ${FONT}`;
  for (const t of tokens) {
    if (t.kind === 'box') {
      const prev = words[words.length - 1];
      if (prev && prev.box === undefined && prev.trailingBox === undefined) {
        prev.trailingBox = t.checked;
        prev.width += size * 0.35 + size * 1.05;
      } else {
        words.push({ text: '', bold: false, box: t.checked, width: size * 1.05, spaceAfter: false });
      }
      continue;
    }
    const bold = t.kind === 'value';
    c.font = font(bold);
    for (const piece of t.text.split(/(\s+)/)) {
      if (piece === '') continue;
      if (/^\s+$/.test(piece)) {
        const prev = words[words.length - 1];
        if (prev) prev.spaceAfter = true;
        continue;
      }
      words.push({ text: piece, bold, width: c.measureText(piece).width, spaceAfter: false });
    }
  }
  return words;
}

function drawBox(c: CanvasRenderingContext2D, x: number, y: number, size: number, checked: boolean): void {
  const s = size * 0.95;
  const top = y - s * 0.85;
  c.lineWidth = 2.5;
  c.strokeStyle = '#000';
  c.strokeRect(x + 2, top, s - 4, s - 4);
  if (checked) {
    c.beginPath();
    c.moveTo(x + 8, top + 6);
    c.lineTo(x + s - 10, top + s - 10);
    c.moveTo(x + s - 10, top + 6);
    c.lineTo(x + 8, top + s - 10);
    c.lineWidth = 4;
    c.stroke();
  }
}

function drawParagraph(c: CanvasRenderingContext2D, tokens: Token[], x: number, y: number, width: number, size: number, lineH: number, indent: number): number {
  const words = layoutWords(c, tokens, size);
  c.font = `400 ${size}px ${FONT}`;
  const space = c.measureText(' ').width;
  let i = 0;
  let first = true;
  while (i < words.length) {
    const avail = width - (first ? indent : 0);
    let lineW = 0;
    let j = i;
    while (j < words.length) {
      const w = words[j]!;
      const add = (j > i && words[j - 1]!.spaceAfter ? space : 0) + w.width;
      if (j > i && lineW + add > avail) break;
      lineW += add;
      j++;
    }
    const last = j >= words.length;
    const gaps = words.slice(i, j - 1).filter((w) => w.spaceAfter).length;
    const extra = !last && gaps > 0 ? (avail - lineW) / gaps : 0;
    let cx = x + (first ? indent : 0);
    for (let k = i; k < j; k++) {
      const w = words[k]!;
      if (w.box !== undefined) {
        drawBox(c, cx, y, size, w.box);
      } else {
        c.font = `${w.bold ? '700' : '400'} ${size}px ${FONT}`;
        c.fillStyle = '#000';
        c.fillText(w.text, cx, y);
        if (w.trailingBox !== undefined) {
          const bx = cx + c.measureText(w.text).width + size * 0.35;
          drawBox(c, bx, y, size, w.trailingBox);
        }
      }
      cx += w.width;
      if (w.spaceAfter && k < j - 1) cx += space + extra;
    }
    y += lineH;
    i = j;
    first = false;
  }
  return y;
}

function drawSignature(c: CanvasRenderingContext2D, dataUrl: HTMLImageElement | null, x1: number, x2: number, lineY: number): void {
  if (dataUrl) {
    const boxW = x2 - x1;
    const boxH = 200;
    const s = Math.min(boxW / dataUrl.width, boxH / dataUrl.height);
    const w = dataUrl.width * s;
    const hh = dataUrl.height * s;
    c.drawImage(dataUrl, x1 + (boxW - w) / 2, lineY - hh + 10, w, hh);
  }
  c.strokeStyle = '#000';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(x1, lineY);
  c.lineTo(x2, lineY);
  c.stroke();
}

export async function renderDeclaration(d: DeclarationData, clientSig: string, techSig: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const c = canvas.getContext('2d') as CanvasRenderingContext2D;
  c.fillStyle = '#fff';
  c.fillRect(0, 0, PAGE_W, PAGE_H);
  c.textBaseline = 'alphabetic';

  const [logo, sigA, sigB] = await Promise.all([
    loadImage(new URL('livehouse-logo.png', document.baseURI).href),
    loadImage(clientSig),
    loadImage(techSig),
  ]);
  if (logo) {
    const w = 300;
    c.drawImage(logo, PAGE_W - 140 - w + 20, 50, w, (logo.height * w) / logo.width);
  }

  const size = 29;
  c.fillStyle = '#000';
  c.font = `700 ${size}px ${FONT}`;
  c.textAlign = 'center';
  c.fillText('DECLARAÇÃO', PAGE_W / 2, 280);
  const tw = c.measureText('DECLARAÇÃO').width;
  c.fillRect(PAGE_W / 2 - tw / 2, 286, tw, 2.5);
  c.textAlign = 'left';

  const margin = 140;
  const end = drawParagraph(c, declarationTokens(d), margin, 445, PAGE_W - 2 * margin, size, 84, 100);

  c.font = `400 ${size}px ${FONT}`;
  c.fillText(placeAndDate(d.place, d.date), margin, Math.max(end + 160, 1080));

  const lineY = 1350;
  drawSignature(c, sigA, 166, 774, lineY);
  drawSignature(c, sigB, 997, 1427, lineY);
  c.font = `400 ${size * 0.85}px ${FONT}`;
  c.textAlign = 'center';
  c.fillText('(Assinatura do Proprietário(a) / Inquilino (a) / Rep. Legal)', (166 + 774) / 2, lineY + 52);
  c.fillText('(Assinatura do Técnico da LiveHouse)', (997 + 1427) / 2, lineY + 52);

  c.font = `400 ${size * 0.75}px ${FONT}`;
  c.fillText('LiveHouse – Inspecção de Edifícios e Consultoria, Lda (NIF:510 984 100)', PAGE_W / 2, 2178);
  c.fillText('www.livehouse.pt    Tel: 218 131 692    email: info@livehouse.pt', PAGE_W / 2, 2207);
  c.fillText('Avenida Almirante Reis Nº126 4ºESQ, 1150-023 Lisboa', PAGE_W / 2, 2236);
  c.textAlign = 'left';
  return canvas;
}

async function canvasToPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem.'))), 'image/jpeg', 0.9),
  );
  const pdf = jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height);
  return new Blob([pdf], { type: 'application/pdf' });
}

// ---------------- Ecrã ----------------

/** Declaração de presença do processo: preencher, assinar (cliente e técnico) e guardar o PDF em "7. Outros Dados". */
export function mountDeclaration(root: HTMLElement, ctx: AppContext, process: Process): () => void {
  let disposed = false;
  const now = new Date();

  const field = (name: string, attrs: Record<string, unknown> = {}): HTMLInputElement =>
    h('input', { class: 'field', name, autocomplete: 'off', ...attrs }) as HTMLInputElement;
  const nameInput = field('nome', { type: 'text', maxLength: 80, placeholder: 'Nome completo' });
  const extraInput = field('extra', { type: 'text', maxLength: 80, placeholder: 'Opcional' });
  const addressInput = field('morada', { type: 'text', maxLength: 160, placeholder: 'Rua, n.º, andar, localidade' });
  const dateInput = field('data', { type: 'date', value: isoDate(now) });
  const startInput = field('inicio', { type: 'time', value: '' });
  const endInput = field('fim', { type: 'time', value: hhmm(now) });
  const placeInput = field('local', { type: 'text', maxLength: 40, value: 'Lisboa' });
  let capacity: Capacity = 'proprietario';
  const capButtons = (Object.keys(CAPACITY_LABEL) as Capacity[]).map((cap) =>
    h(
      'button',
      {
        class: `chip${cap === capacity ? ' on' : ''}`,
        type: 'button',
        'data-cap': cap,
        onclick: () => {
          capacity = cap;
          capButtons.forEach((b) => b.classList.toggle('on', b.getAttribute('data-cap') === cap));
        },
      },
      CAPACITY_LABEL[cap],
    ),
  );
  const clientPad = createSignaturePad('Assinatura do cliente (Proprietário / Inquilino / Rep. Legal)');
  const techPad = createSignaturePad('Assinatura do técnico da LiveHouse');
  const rememberTech = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const lastSaved = h('p', { class: 'hint', hidden: true });

  const label = (text: string, input: HTMLElement): HTMLElement => h('label', { class: 'field-label' }, text, input);

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'back', href: processHash(process.id), 'aria-label': 'Voltar ao processo' }, '←'),
      h('div', { class: 'title-block' }, h('small', null, `Processo ${process.id}`), h('strong', null, 'Declaração de presença')),
    ),
    h(
      'main',
      { class: 'content declaration' },
      lastSaved,
      label('Exmo(a). Sr(a).', nameInput),
      label('Segundo campo, a seguir ao nome', extraInput),
      h('div', { class: 'field-label' }, 'Na qualidade de', h('div', { class: 'chips' }, ...capButtons)),
      label('Imóvel sito na', addressInput),
      label('Dia da inspeção', dateInput),
      h('div', { class: 'two-cols' }, label('Das', startInput), label('Às', endInput)),
      label('Local', placeInput),
      h('p', { class: 'hint' }, `Processo ${process.id}-LIS · serviço solicitado Inspeção e Diagnóstico`),
      clientPad.el,
      techPad.el,
      h('label', { class: 'check' }, rememberTech, ' Lembrar a assinatura do técnico neste telemóvel'),
      error,
      h('button', { class: 'btn primary big', type: 'button', onclick: () => void preview() }, 'Ver declaração'),
    ),
  );

  // A mensagem do que falta desaparece logo que se corrige alguma coisa.
  root.addEventListener('input', () => (error.hidden = true));
  root.addEventListener('pointerdown', () => (error.hidden = true));

  function data(): DeclarationData {
    return {
      processId: process.id,
      name: nameInput.value,
      extra: extraInput.value,
      capacity,
      address: addressInput.value,
      date: dateInput.value,
      start: startInput.value,
      end: endInput.value,
      place: placeInput.value.trim() || 'Lisboa',
    };
  }

  async function preview(): Promise<void> {
    const d = data();
    const missing = missingFields(d);
    if (clientPad.isEmpty()) missing.push('a assinatura do cliente');
    if (techPad.isEmpty()) missing.push('a assinatura do técnico');
    if (missing.length) {
      error.textContent = `Falta ${missing.join(', ')}.`;
      error.hidden = false;
      error.scrollIntoView({ block: 'center' });
      return;
    }
    error.hidden = true;
    const clientSig = clientPad.toDataUrl();
    const techSig = techPad.toDataUrl();
    const page = await renderDeclaration(d, clientSig, techSig);
    if (disposed) return;
    const url = page.toDataURL('image/jpeg', 0.85);
    const dlg = h('dialog', { class: 'photo-dialog decl-preview' });
    const close = (): void => dlg.close();
    const saveBtn = h('button', { class: 'btn primary', type: 'button' }, 'Guardar declaração');
    saveBtn.addEventListener('click', () => {
      saveBtn.setAttribute('disabled', '');
      void save(d, page, techSig).then((ok) => {
        if (ok) close();
        else saveBtn.removeAttribute('disabled');
      });
    });
    dlg.append(
      h('img', { class: 'decl-page', src: url, alt: 'Declaração preenchida' }),
      h('div', { class: 'dlg-actions' }, saveBtn, h('button', { class: 'btn', type: 'button', onclick: close }, 'Corrigir')),
    );
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  async function save(d: DeclarationData, page: HTMLCanvasElement, techSig: string): Promise<boolean> {
    try {
      const pdf = await canvasToPdf(page);
      const { remotePath } = await ctx.provider.uploadPhoto({
        folder: `${process.folder}/${OTHER_DATA_SUBFOLDER}`,
        fileName: declarationFileName(d),
        blob: pdf,
      });
      const saved: SavedDeclaration = {
        path: remotePath,
        savedAt: Date.now(),
        name: d.name.trim(),
        extra: d.extra.trim(),
        capacity: d.capacity,
        address: d.address.trim(),
        place: d.place,
      };
      await ctx.store.setMeta(declarationKey(process.id), saved);
      writePref(TECH_SIGNATURE_PREF, rememberTech.checked ? techSig : '');
      toast('Declaração guardada em “7. Outros Dados”.', 5000);
      location.replace(processHash(process.id));
      return true;
    } catch (err) {
      toast(`Não foi possível guardar a declaração: ${err instanceof Error ? err.message : String(err)}`, 7000);
      return false;
    }
  }

  // Preencher com o que já se sabe: última declaração deste processo, hora da primeira foto de hoje, assinatura do técnico.
  void (async () => {
    const [prev, photos] = await Promise.all([
      ctx.store.getMeta<SavedDeclaration>(declarationKey(process.id)),
      ctx.store.listByProcess(process.id),
    ]);
    if (disposed) return;
    if (prev) {
      nameInput.value = prev.name;
      extraInput.value = prev.extra;
      addressInput.value = prev.address;
      placeInput.value = prev.place || 'Lisboa';
      capacity = prev.capacity;
      capButtons.forEach((b) => b.classList.toggle('on', b.getAttribute('data-cap') === capacity));
      lastSaved.textContent = `Já existe uma declaração guardada em ${new Date(prev.savedAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}. Ao guardar de novo fica um ficheiro novo.`;
      lastSaved.hidden = false;
    }
    const today = isoDate(now);
    const first = photos.filter((p) => isoDate(new Date(p.takenAt)) === today).sort((a, b) => a.takenAt - b.takenAt)[0];
    startInput.value = first ? hhmm(new Date(first.takenAt)) : '';
    const tech = readPref(TECH_SIGNATURE_PREF);
    if (tech) techPad.load(tech);
  })();

  return () => {
    disposed = true;
  };
}
