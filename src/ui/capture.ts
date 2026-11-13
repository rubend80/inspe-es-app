import type { AppContext } from '../context.ts';
import { nextDivision } from '../divisions.ts';
import { formatPhotoCount, formatResolution, STATUS_LABEL } from '../format.ts';
import { divisionHash, divisionsHash } from '../routes.ts';
import { inFraction, scopeOf } from '../fractions.ts';
import type { Division, Fraction, PhotoRecord, Process } from '../types.ts';
import {
  describeRange,
  formatZoom,
  isZoomAvailable,
  nearestLevel,
  unavailableMessage,
  ZOOM_LEVELS,
  zoomRangeOf,
  zoomValueFor,
} from '../zoom.ts';
import type { ZoomLevel, ZoomRange } from '../zoom.ts';
import { h, readPref, toast, writePref } from './dom.ts';
import { openPhotoDialog } from './photoDialog.ts';
import { createStatusPill } from './statusPill.ts';
import { createStorageBanner } from './storageBanner.ts';
import { createNativeSession } from './nativeSession.ts';
import { isNativeApp } from '../native/nativePhotos.ts';

// ImageCapture (foto em resolução total) existe no Chrome/Android mas não está nos tipos do TypeScript.
type PhotoSettingsLike = { imageWidth?: number; imageHeight?: number };
type PhotoCapabilitiesLike = { imageWidth?: { max?: number }; imageHeight?: { max?: number } };
type ImageCaptureLike = {
  takePhoto(settings?: PhotoSettingsLike): Promise<Blob>;
  getPhotoCapabilities?(): Promise<PhotoCapabilitiesLike>;
};
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

function cameraErrorText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Sem autorização para usar a câmara. Permita o acesso nas definições do site ou use a câmara do sistema.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Não foi encontrada nenhuma câmara neste dispositivo.';
  if (name === 'NotReadableError') return 'A câmara está a ser usada por outra aplicação.';
  return 'Não foi possível abrir a câmara. Pode usar a câmara do sistema.';
}

const ZOOM_PREF = 'zoom';
const CAMERA_PREF = 'camera';

/**
 * Que câmara usar. "phone" (de origem) = a app de câmara do próprio telemóvel, com toda a qualidade e o processamento dela;
 * "app" = a câmara dentro da app (fotos seguidas, zoom), mais rápida mas sem o processamento do telemóvel.
 */
type CameraMode = 'phone' | 'app';
function savedCameraMode(): CameraMode {
  return readPref(CAMERA_PREF) === 'app' ? 'app' : 'phone';
}

/** Data da foto: a do ficheiro (fotos da galeria tiradas antes), se fizer sentido; senão, agora. */
function takenAtOf(file: Blob): Date {
  const modified = file instanceof File ? file.lastModified : NaN;
  const now = Date.now();
  if (Number.isFinite(modified) && modified > Date.UTC(2015, 0, 1) && modified <= now + 60_000) return new Date(modified);
  return new Date(now);
}

/** O último zoom escolhido (fica para as divisões seguintes). */
function savedZoom(): ZoomLevel {
  const value = Number(readPref(ZOOM_PREF));
  return ZOOM_LEVELS.find((level) => level === value) ?? 1;
}

/** Ecrã de captura de uma divisão: tirar fotos seguidas, que ficam logo na pasta dessa divisão. */
export function mountCapture(
  root: HTMLElement,
  ctx: AppContext,
  process: Process,
  division: Division,
  fraction?: Fraction,
): () => void {
  let disposed = false;
  let stream: MediaStream | null = null;
  let starting = false;
  let grabbing = false;
  let torchOn = false;
  // Resolução máxima das fotos da câmara em uso. undefined = ainda não consultada; null = não disponível.
  let photoSettings: PhotoSettingsLike | null | undefined;
  let photoSettingsReady: Promise<void> | undefined;
  // Zoom: o que o telemóvel permite, o que está ativo e o que o inspetor escolheu por último.
  let zoomRange: ZoomRange | null = null;
  let activeZoom: ZoomLevel = 1;
  let wantedZoom: ZoomLevel = savedZoom();
  let renderSeq = 0;
  let urls: string[] = [];
  let nextTarget = divisionsHash(process.id, fraction?.id);

  const pill = createStatusPill(ctx);
  const banner = createStorageBanner(ctx);

  const video = h('video', { class: 'viewfinder', playsInline: true, muted: true, autoplay: true });
  const camMsg = h('div', { class: 'cam-msg', hidden: true });
  const flashEl = h('div', { class: 'flash' });
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment',
    hidden: true,
    onchange: () => void onNativeFiles(fileInput),
  });
  // Galeria: várias fotos de uma vez (por exemplo, tiradas antes com a câmara do telemóvel). Ficam tal e qual.
  const galleryInput = h('input', {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    hidden: true,
    onchange: () => void onNativeFiles(galleryInput),
  });
  // Na app Android só há a câmara do telemóvel.
  let mode: CameraMode = isNativeApp() ? 'phone' : savedCameraMode();

  const shutter = h('button', {
    class: 'shutter',
    type: 'button',
    'aria-label': `Tirar foto (${division.name})`,
    onclick: () => void capture(),
  });
  const systemCamBtn = h(
    'button',
    { class: 'cam-btn', type: 'button', onclick: () => fileInput.click() },
    'Câmara do telemóvel',
  );
  const torchBtn = h('button', { class: 'cam-btn', type: 'button', hidden: true, onclick: () => void toggleTorch() }, 'Lanterna');
  const zoomButtons = ZOOM_LEVELS.map((level) =>
    h(
      'button',
      {
        class: 'zoom-btn',
        type: 'button',
        'aria-label': `Zoom ${formatZoom(level)}`,
        onclick: () => void chooseZoom(level),
      },
      formatZoom(level),
    ),
  );
  const zoomBar = h('div', { class: 'zoom-bar', role: 'group', 'aria-label': 'Zoom', hidden: true }, ...zoomButtons);
  const camInfo = h('div', { class: 'cam-info', hidden: true });

  const count = h('strong', null, formatPhotoCount(0));
  const nextLink = h(
    'a',
    {
      class: 'next-btn',
      href: nextTarget,
      hidden: true,
      onclick: (e: Event) => {
        e.preventDefault();
        location.replace(nextTarget); // substitui a entrada atual: "Voltar" regressa sempre ao processo
      },
    },
    'Concluir',
  );
  const grid = h('div', { class: 'photo-grid' });

  const webPanel = (): HTMLElement => h(
    'section',
    { class: 'phone-cam' },
    h(
      'button',
      { class: 'btn primary big', type: 'button', onclick: () => galleryInput.click() },
      'Juntar fotos da galeria',
    ),
    h(
      'ol',
      { class: 'steps' },
      h('li', null, 'Abra a câmara normal do telemóvel e tire todas as fotos desta divisão, seguidas.'),
      h('li', null, 'Volte aqui, toque em “Juntar fotos da galeria” e selecione-as (pode escolher várias).'),
    ),
    h(
      'p',
      { class: 'hint' },
      'As fotos ficam guardadas tal e qual saíram da câmara. Se selecionar uma foto que já juntou, não é repetida.',
    ),
    h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, 'Tirar só uma foto'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => setMode('app') }, 'Usar a câmara da app (zoom, fotos seguidas)'),
  );  // Na app Android instalada: a câmara normal do telemóvel, com as fotos a entrarem sozinhas.
  const nativeSession = isNativeApp()
    ? createNativeSession(ctx, process, division, fraction, [])
    : null;
  const phonePanel = nativeSession ? nativeSession.el : webPanel();

  const appCameraNote = h(
    'button',
    { class: 'link-btn', type: 'button', onclick: () => setMode('phone') },
    'Usar sempre a câmara do telemóvel (melhor qualidade)',
  );

  root.append(
    h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'back', href: divisionsHash(process.id, fraction?.id), 'aria-label': 'Voltar às divisões' }, '←'),
      h(
        'div',
        { class: 'title-block' },
        h('strong', null, division.name),
        h('small', null, `Processo ${process.id} · ${fraction ? fraction.name : 'Moradia'}`),
      ),
      pill.el,
    ),
    banner.el,
    h(
      'main',
      { class: 'capture' },
      phonePanel,
      h(
        'section',
        { class: 'camera' },
        video,
        camMsg,
        flashEl,
        camInfo,
        zoomBar,
        h('div', { class: 'cam-controls' }, systemCamBtn, shutter, torchBtn),
      ),
      h('div', { class: 'grid-head' }, count, nextLink),
      grid,
      appCameraNote,
      fileInput,
      galleryInput,
    ),
  );
  const cameraSection = root.querySelector<HTMLElement>('section.camera');

  // ---- Câmara ----

  function showCamMessage(text: string): void {
    camMsg.replaceChildren(
      h('p', null, text),
      h('button', { class: 'btn primary', type: 'button', onclick: () => void startCamera() }, 'Tentar novamente'),
      h('button', { class: 'btn', type: 'button', onclick: () => setMode('phone') }, 'Usar a câmara do telemóvel'),
    );
    camMsg.hidden = false;
    zoomBar.hidden = true;
    camInfo.hidden = true;
  }

  async function startCamera(): Promise<void> {
    if (stream || starting || disposed) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      showCamMessage('A câmara só funciona em ligação segura (HTTPS). Pode usar a câmara do sistema.');
      return;
    }
    starting = true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (disposed) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      photoSettings = undefined;
      photoSettingsReady = undefined;
      video.srcObject = s;
      await video.play().catch(() => undefined);
      camMsg.hidden = true;
      const track = s.getVideoTracks()[0];
      if (track) {
        track.addEventListener('ended', () => {
          if (stream === s) {
            stream = null;
            showCamMessage('A câmara foi interrompida.');
          }
        });
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        torchBtn.hidden = !caps.torch;
        zoomRange = zoomRangeOf(caps);
        activeZoom = 1;
        zoomBar.hidden = false;
        updateZoomUi();
        // volta ao zoom da divisão anterior (o telemóvel começa sempre em 1×)
        if (wantedZoom !== 1 && isZoomAvailable(wantedZoom, zoomRange)) await applyZoom(wantedZoom);
        void showPhotoInfo(track);
      }
    } catch (err) {
      showCamMessage(cameraErrorText(err));
    } finally {
      starting = false;
    }
  }

  function stopCamera(): void {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    activeZoom = 1;
    torchOn = false;
    torchBtn.classList.remove('on');
  }

  async function toggleTorch(): Promise<void> {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      torchOn = next;
      torchBtn.classList.toggle('on', torchOn);
    } catch {
      toast('Não foi possível ligar a lanterna.');
    }
  }

  // ---- Zoom ----

  function updateZoomUi(): void {
    ZOOM_LEVELS.forEach((level, i) => {
      const button = zoomButtons[i];
      if (!button) return;
      const available = isZoomAvailable(level, zoomRange);
      button.classList.toggle('on', level === activeZoom);
      button.classList.toggle('off', !available);
      button.setAttribute('aria-pressed', String(level === activeZoom));
      button.setAttribute('aria-disabled', String(!available)); // não é "disabled": o toque explica porquê
    });
  }

  /** Pede o zoom ao telemóvel e passa a mostrar o que ele realmente aplicou. */
  async function applyZoom(level: ZoomLevel): Promise<void> {
    const track = stream?.getVideoTracks()[0];
    if (!track || !zoomRange) {
      activeZoom = 1;
      updateZoomUi();
      return;
    }
    try {
      await track.applyConstraints({ advanced: [{ zoom: zoomValueFor(level, zoomRange) }] } as unknown as MediaTrackConstraints);
      const actual = (track.getSettings() as { zoom?: number }).zoom;
      activeZoom = typeof actual === 'number' ? nearestLevel(actual) : level;
    } catch {
      toast('Não foi possível mudar o zoom.');
    }
    updateZoomUi();
  }

  async function chooseZoom(level: ZoomLevel): Promise<void> {
    if (!stream) return;
    if (!isZoomAvailable(level, zoomRange)) {
      toast(unavailableMessage(level, zoomRange), 5000);
      return;
    }
    wantedZoom = level;
    writePref(ZOOM_PREF, String(level));
    await applyZoom(level);
  }

  function frameFromVideo(): Promise<Blob> {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return Promise.reject(new Error('A câmara ainda não está pronta.'));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem.'))), 'image/jpeg', 0.92),
    );
  }

  function imageCaptureFor(track: MediaStreamTrack): ImageCaptureLike | undefined {
    const Impl = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
    return Impl ? new Impl(track) : undefined;
  }

  /** Pergunta uma só vez à câmara qual a resolução máxima das fotos (quem chegar depois espera pela mesma resposta). */
  function ensurePhotoSettings(track: MediaStreamTrack): Promise<void> {
    photoSettingsReady ??= (async () => {
      photoSettings = null;
      try {
        const caps = await imageCaptureFor(track)?.getPhotoCapabilities?.();
        const imageWidth = caps?.imageWidth?.max;
        const imageHeight = caps?.imageHeight?.max;
        if (imageWidth && imageHeight) photoSettings = { imageWidth, imageHeight };
      } catch {
        /* sem capacidades: foto normal */
      }
    })();
    return photoSettingsReady;
  }

  /** Linha sobre a imagem: com que resolução vão ser tiradas as fotos e que zoom o telemóvel dá. */
  async function showPhotoInfo(track: MediaStreamTrack): Promise<void> {
    if (!imageCaptureFor(track)) {
      camInfo.textContent = `Foto: imagem do vídeo · ${describeRange(zoomRange)}`;
    } else {
      await ensurePhotoSettings(track);
      if (disposed || stream?.getVideoTracks()[0] !== track) return;
      const { imageWidth, imageHeight } = photoSettings ?? {};
      camInfo.textContent =
        imageWidth && imageHeight
          ? `Foto: ${formatResolution(imageWidth, imageHeight)} · ${describeRange(zoomRange)}`
          : `Foto: resolução normal da câmara · ${describeRange(zoomRange)}`;
    }
    camInfo.hidden = false;
  }

  async function grabFrame(): Promise<Blob> {
    const track = stream?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') throw new Error('A câmara não está ativa.');
    const capture = imageCaptureFor(track);
    if (capture) {
      // 1.º: a resolução máxima que a câmara indica. A imagem do ecrã (abaixo) fica limitada ao tamanho do vídeo.
      await ensurePhotoSettings(track);
      if (photoSettings) {
        try {
          return await capture.takePhoto(photoSettings);
        } catch {
          photoSettings = null; // este telemóvel não aceita: deixa de tentar
        }
      }
      try {
        return await capture.takePhoto(); // resolução por omissão da câmara
      } catch {
        /* alguns telemóveis falham: usa a imagem do ecrã */
      }
    }
    return frameFromVideo();
  }

  // ---- Tirar e guardar fotos ----

  function feedback(): void {
    flashEl.classList.remove('go');
    void flashEl.offsetWidth; // reinicia a animação
    flashEl.classList.add('go');
    navigator.vibrate?.(25);
  }

  async function save(blob: Blob, takenAt?: Date): Promise<void> {
    try {
      await ctx.photos.addPhoto(process, division, blob, takenAt, fraction);
    } catch (err) {
      toast(`Não foi possível guardar a foto: ${err instanceof Error ? err.message : String(err)}`, 5000);
    }
    void renderGrid();
  }

  async function capture(): Promise<void> {
    if (grabbing) return;
    grabbing = true;
    shutter.classList.add('busy');
    let blob: Blob;
    try {
      blob = await grabFrame();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível tirar a foto.');
      return;
    } finally {
      grabbing = false;
      shutter.classList.remove('busy');
    }
    feedback();
    void save(blob); // não bloqueia: dá para disparar logo a seguinte
  }

  async function onNativeFiles(input: HTMLInputElement): Promise<void> {
    const picked = Array.from(input.files ?? []).sort((a, b) => a.lastModified - b.lastModified);
    input.value = '';
    if (picked.length === 0) return;
    // Não juntar duas vezes a mesma foto da galeria (no mesmo processo).
    const key = `imported:${process.id}`;
    const seen = new Set((await ctx.store.getMeta<string[]>(key)) ?? []);
    const idOf = (f: File): string => `${f.name}|${f.size}`;
    const files = picked.filter((f) => !seen.has(idOf(f)));
    const repeated = picked.length - files.length;
    if (files.length === 0) {
      toast(repeated === 1 ? 'Essa foto já tinha sido junta.' : 'Essas fotos já tinham sido juntas.');
      return;
    }
    toast(
      `A guardar ${files.length === 1 ? '1 foto' : `${files.length} fotos`}…` +
        (repeated > 0 ? ` (${repeated} já estava${repeated === 1 ? '' : 'm'} junta${repeated === 1 ? '' : 's'})` : ''),
    );
    for (const file of files) {
      await save(file, takenAtOf(file));
      seen.add(idOf(file));
    }
    await ctx.store.setMeta(key, [...seen]);
  }

  // ---- Câmara do telemóvel ou câmara da app ----

  function setMode(next: CameraMode): void {
    mode = next;
    writePref(CAMERA_PREF, next);
    applyMode();
  }

  function applyMode(): void {
    const phone = mode === 'phone';
    phonePanel.hidden = !phone;
    appCameraNote.hidden = phone;
    if (cameraSection) cameraSection.hidden = phone;
    if (phone) stopCamera();
    else void startCamera();
  }

  // ---- Fotos desta divisão ----

  function revokeUrls(): void {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  }

  function thumbButton(p: PhotoRecord): HTMLElement {
    const src = p.thumb ?? p.blob;
    let img: HTMLElement;
    if (src) {
      const url = URL.createObjectURL(src);
      urls.push(url);
      img = h('img', { src: url, alt: p.fileName });
    } else {
      img = h('div', { class: 'ph' }, 'Sem pré-visualização');
    }
    return h(
      'button',
      { class: `thumb s-${p.status}`, type: 'button', onclick: () => void openPhotoDialog(ctx, p.id) },
      img,
      h('span', { class: 'tag' }, STATUS_LABEL[p.status]),
    );
  }

  async function renderGrid(): Promise<void> {
    const seq = ++renderSeq;
    const photos = (await ctx.store.listByProcess(process.id))
      .filter((p) => p.divisionId === division.id && inFraction(p, fraction?.id))
      .sort((a, b) => b.takenAt - a.takenAt);
    if (disposed || seq !== renderSeq) return;
    revokeUrls();
    count.textContent = formatPhotoCount(photos.length);
    if (photos.length === 0) {
      grid.replaceChildren(h('p', { class: 'empty' }, `As fotos de ${division.name} aparecem aqui.`));
      return;
    }
    grid.replaceChildren(...photos.map(thumbButton));
  }

  const unsubscribe = ctx.queue.subscribe(() => void renderGrid());

  // Ligação rápida para a divisão seguinte (ou para concluir, na última).
  void ctx.divisions.list(process.id, scopeOf(fraction)).then((list) => {
    if (disposed) return;
    const next = nextDivision(list, division.id);
    if (next) {
      nextTarget = divisionHash(process.id, next.id, fraction?.id);
      nextLink.textContent = `Próxima: ${next.name} →`;
    } else {
      nextTarget = divisionsHash(process.id, fraction?.id);
      nextLink.textContent = 'Concluir';
    }
    nextLink.setAttribute('href', nextTarget);
    nextLink.hidden = false;
  });

  function onVisibility(): void {
    if (document.visibilityState === 'visible') {
      if (mode === 'app') void startCamera();
    }
    else stopCamera(); // o Android corta a câmara em segundo plano; libertamo-la nós
  }
  document.addEventListener('visibilitychange', onVisibility);

  void renderGrid();
  applyMode();

  return () => {
    disposed = true;
    stopCamera();
    unsubscribe();
    pill.dispose();
    banner.dispose();
    nativeSession?.dispose();
    document.removeEventListener('visibilitychange', onVisibility);
    revokeUrls();
  };
}
