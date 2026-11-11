import { fitWithin, LIGHT_BOX_LONG, LIGHT_BOX_SHORT, LIGHT_JPEG_QUALITY } from '../naming.ts';
import type { ImageInfo } from '../photoService.ts';

/** Lado maior da miniatura da grelha. */
export const THUMB_SIDE = 360;
/** Lado maior da pré-visualização do detalhe (fica guardada mesmo depois de a original ser apagada). */
export const PREVIEW_SIDE = 1280;

/** JPEG da foto ajustada a uma caixa (lado maior x lado menor); nunca aumenta. */
function scaledJpeg(bitmap: ImageBitmap, boxLong: number, boxShort: number, quality: number): Promise<Blob | undefined> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, boxLong, boxShort);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return Promise.resolve(undefined);
  ctx2d.imageSmoothingQuality = 'high';
  ctx2d.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', quality));
}

/**
 * Lê a foto uma só vez e devolve: dimensões originais, miniatura (grelha) e pré-visualização (detalhe).
 * A original segue inalterada para o envio; isto serve apenas para mostrar a foto na app.
 */
export async function processImage(blob: Blob): Promise<ImageInfo> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return {}; // sem miniaturas a app funciona na mesma
  }
  try {
    const info: ImageInfo = { width: bitmap.width, height: bitmap.height };
    try {
      info.thumb = await scaledJpeg(bitmap, THUMB_SIDE, THUMB_SIDE, 0.7);
      info.preview = await scaledJpeg(bitmap, PREVIEW_SIDE, PREVIEW_SIDE, 0.85);
    } catch {
      /* fica o que já foi gerado */
    }
    return info;
  } finally {
    bitmap.close();
  }
}

/**
 * Versão leve para a pasta "Fotos - Light": a foto reduzida para caber em 2500 × 1875 px (1875 × 2500 se estiver em pé),
 * como o "Image Resizer" do Windows em Personalizado/Ajustar (ver LIGHT_BOX_LONG, LIGHT_BOX_SHORT e LIGHT_JPEG_QUALITY
 * em naming.ts). Nunca aumenta a foto. Lê a orientação da câmara, por isso sai direita.
 */
export async function makeLightVersion(original: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(original);
  try {
    const blob = await scaledJpeg(bitmap, LIGHT_BOX_LONG, LIGHT_BOX_SHORT, LIGHT_JPEG_QUALITY);
    if (!blob) throw new Error('falhou a compressão');
    return blob;
  } finally {
    bitmap.close();
  }
}
