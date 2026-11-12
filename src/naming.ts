// Convenção de nomes. É aqui (e só aqui) que se decide como as fotos se chamam
// e em que pastas ficam. Ajustar à realidade da empresa.
//
// Estrutura no destino (cada foto vai duas vezes: original e versão leve):
//   <processo> / 2. Fotos / <divisão> / <foto>            original, máxima qualidade
//   <processo> / 3. Fotos - Light / <divisão> / <foto>    versão leve (JPEG reduzido)
// Num prédio, com frações, há uma pasta da fração antes da divisão:
//   <processo> / 2. Fotos / <fração> / <divisão> / <foto>
// Exemplo:  2026/02 Fevereiro/260098 - Praça de Portugal 7 Odivelas - Ana Mafalda Leiria
//             / 2. Fotos / Cozinha / 20261103_143015.jpg
//             / 2. Fotos / Fração A / Cozinha / 20261103_143100.jpg

/**
 * Pasta, dentro do processo, onde ficam as fotos da inspeção (as originais, em resolução total).
 * Vazio = as divisões ficam logo dentro do processo.
 */
export const PHOTOS_SUBFOLDER = '2. Fotos';

/** Pasta, dentro do processo, para a versão leve das fotos (a mesma divisão e o mesmo nome do original). */
export const LIGHT_SUBFOLDER = '3. Fotos - Light';

/**
 * Versão leve: a mesma redução que a empresa faz à mão com o "Image Resizer" do Windows, em
 * Personalizado, Ajustar (Fit), 2500 × 1875 píxeis. A foto cabe dentro desta caixa sem cortes nem deformação;
 * numa foto em pé a caixa roda (1875 × 2500). Não aumenta fotos mais pequenas.
 * A qualidade JPEG (0 a 1) é a predefinida desse programa (90), que só se vê em "Advanced options".
 */
export const LIGHT_BOX_LONG = 2500;
export const LIGHT_BOX_SHORT = 1875;
export const LIGHT_JPEG_QUALITY = 0.9;

/**
 * Tamanho de uma foto depois de a ajustar a uma caixa (lado maior x lado menor), mantendo as proporções.
 * A caixa acompanha a orientação da foto: em pé fica 1875 × 2500, deitada 2500 × 1875. Nunca aumenta a foto.
 */
export function fitWithin(width: number, height: number, boxLong: number, boxShort: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width, height };
  const landscape = width >= height;
  const boxWidth = landscape ? boxLong : boxShort;
  const boxHeight = landscape ? boxShort : boxLong;
  const scale = Math.min(1, boxWidth / width, boxHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

/** Texto seguro para nomes de ficheiro: minúsculas, sem acentos, só letras, números e "-". */
export function slugify(input: string, maxLen = 32): string {
  const s = input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, maxLen).replace(/-+$/g, '');
}

/** Nome de pasta legível ("Casa de banho 1"), sem os caracteres que o SharePoint não aceita. */
export function folderNameFor(name: string): string {
  return name
    .replace(/["*:<>?/\\|#%]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
}

/** AAAAMMDD na hora local do telemóvel. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** HHmmss na hora local do telemóvel. */
export function timeKey(d: Date): string {
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function extFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
    case 'image/heif':
      return 'heic';
    default:
      return 'jpg';
  }
}

export interface FileNameParts {
  takenAt: Date;
  mimeType?: string;
}

/**
 * Nome da foto: só a data e a hora em que foi tirada. Exemplo: 20261112_151003.jpg
 * A pasta já diz o processo, a fração e a divisão. Se houver duas fotos no mesmo segundo
 * na mesma pasta, a segunda fica 20261112_151003_2.jpg (ver uniqueFileName).
 */
export function buildPhotoFileName(p: FileNameParts): string {
  return `${dayKey(p.takenAt)}_${timeKey(p.takenAt)}.${extFromMime(p.mimeType ?? 'image/jpeg')}`;
}

/** Garante um nome que ainda não existe na pasta: acrescenta _2, _3... antes da extensão. */
export function uniqueFileName(fileName: string, taken: ReadonlySet<string>): string {
  if (!taken.has(fileName)) return fileName;
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function joinFolders(...parts: (string | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join('/');
}

/** Pasta de destino do original de uma foto, relativa à raiz dos processos. A fração é opcional. */
export function remoteFolderFor(processFolder: string, divisionFolder?: string, fractionFolder?: string): string {
  return joinFolders(processFolder, PHOTOS_SUBFOLDER, fractionFolder, divisionFolder);
}

/** Pasta de destino da versão leve de uma foto, relativa à raiz dos processos. A fração é opcional. */
export function remoteLightFolderFor(processFolder: string, divisionFolder?: string, fractionFolder?: string): string {
  return joinFolders(processFolder, LIGHT_SUBFOLDER, fractionFolder, divisionFolder);
}

/** A versão leve é sempre JPEG: mesmo nome do original, com a extensão .jpg. */
export function lightFileNameFor(fileName: string): string {
  return /\.[^./]+$/.test(fileName) ? fileName.replace(/\.[^./]+$/, '.jpg') : `${fileName}.jpg`;
}

/** Caminho final de uma foto, relativo à raiz dos processos. */
export function remotePathFor(folder: string, fileName: string): string {
  return `${folder}/${fileName}`;
}
