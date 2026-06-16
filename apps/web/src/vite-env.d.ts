/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Si está definido (p. ej. http://127.0.0.1:8002), las peticiones /api van directo al API y no por el proxy de Vite. */
  readonly VITE_API_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
