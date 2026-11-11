import { LocalProcessList } from '../localProcesses.ts';
import { createFolderAccess } from './folderAccess.ts';
import type { FolderAccess } from './folderAccess.ts';
import { LocalDemoProvider } from './LocalDemoProvider.ts';
import { LocalFolderProvider } from './LocalFolderProvider.ts';
import { NativeFolderProvider } from './NativeFolderProvider.ts';
import { isNativeApp } from '../native/nativePhotos.ts';
import type { PhotoStore } from './PhotoStore.ts';
import type { StorageProvider } from './StorageProvider.ts';

export interface Storage {
  provider: StorageProvider;
  /** Só na versão de demonstração (mostra o painel "Modo de teste"). */
  demo: LocalDemoProvider | null;
  /** Pasta do telemóvel onde ficam as fotos (null na demonstração). */
  folder: FolderAccess | null;
  /** Processos criados no telemóvel (null na demonstração). */
  localProcesses: LocalProcessList | null;
}

/**
 * Único sítio onde se escolhe de onde vêm os processos e para onde vão as fotos.
 *
 * Agora: tudo no telemóvel (processos criados à mão, fotos numa pasta do telemóvel).
 * "?demo" no endereço liga a demonstração antiga (processos de exemplo e "OneDrive de faz de conta").
 *
 * Mais tarde (ligação ao OneDrive/SharePoint): criar GraphProvider.ts a implementar StorageProvider
 * (ver StorageProvider.ts) e devolvê-lo aqui.
 */
export function createStorage(store: PhotoStore, search = ''): Storage {
  if (new URLSearchParams(search).has('demo')) {
    const demo = new LocalDemoProvider();
    return { provider: demo, demo, folder: null, localProcesses: null };
  }
  const localProcesses = new LocalProcessList(store);
  if (isNativeApp()) {
    // App Android instalada: grava em Documents/Inspeções sem escolher pasta.
    return { provider: new NativeFolderProvider(localProcesses), demo: null, folder: null, localProcesses };
  }
  const folder = createFolderAccess(store, search);
  return { provider: new LocalFolderProvider(folder, localProcesses), demo: null, folder, localProcesses };
}
