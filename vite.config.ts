import { defineConfig } from 'vite';

// base './' faz a app funcionar em qualquer caminho (raiz de um domínio ou subpasta).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
