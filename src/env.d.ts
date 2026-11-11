// Tipos mínimos do que o Vite injeta, para o projeto não depender de "vite/client".
declare module '*.css';

interface ImportMeta {
  readonly env: {
    readonly PROD: boolean;
    readonly DEV: boolean;
    readonly BASE_URL: string;
  };
}
