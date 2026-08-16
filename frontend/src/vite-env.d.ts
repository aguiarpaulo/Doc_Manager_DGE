/// <reference types="vite/client" />

/**
 * Variaveis injetadas no bundle sao publicas por definicao: nenhuma delas pode
 * conter segredo. Declara-las aqui evita acesso a variaveis inexistentes
 * passar em silencio pela checagem de tipos.
 */
interface ImportMetaEnv {
  /** Base da API. Ex.: "/api" na mesma origem, ou uma URL completa em dev. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
