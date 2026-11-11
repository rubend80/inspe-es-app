import './styles.css';
import { startApp } from './app.ts';
import { isNativeApp } from './native/nativePhotos.ts';

const root = document.getElementById('app');
if (!root) throw new Error('Elemento #app não encontrado.');
startApp(root);

// Service worker só em produção (em desenvolvimento atrapalharia o recarregamento automático).
// Na app Android instalada não há service worker: a app já vem toda dentro do APK.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !isNativeApp()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
