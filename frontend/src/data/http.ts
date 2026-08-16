/**
 * Fronteira HTTP unica.
 *
 * Este e o unico modulo do projeto autorizado a tocar a rede (a regra de lint
 * `no-restricted-globals` bloqueia `fetch` em todo o resto). Componentes,
 * paginas e hooks chamam as funcoes de dominio de `api.ts`, que por sua vez
 * chamam `request` daqui.
 *
 * Responsabilidades, todas nesta funcao e em nenhum outro lugar:
 * resolver a URL-base, anexar o token, declarar formatos aceitos, definir
 * Content-Type apenas quando o corpo exigir, tratar respostas sem conteudo,
 * converter respostas malsucedidas em ApplicationError e suportar cancelamento.
 */

import { ApplicationError, categoryForStatus, flattenDetail } from "./errors.ts";

/** Le o token da sessao. NODE-020 injeta a implementacao real. */
export type TokenProvider = () => string | null;

let lerToken: TokenProvider = () => null;

export function configurarTokenProvider(provider: TokenProvider): void {
  lerToken = provider;
}

/**
 * Base da API. Vem de configuracao e nunca e presumida, porque a aplicacao
 * precisa funcionar tanto na raiz quanto sob um sub-caminho.
 */
export function resolverUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? "/api";
  const semBarraFinal = base.endsWith("/") ? base.slice(0, -1) : base;
  const comBarraInicial = path.startsWith("/") ? path : `/${path}`;
  return `${semBarraFinal}${comBarraInicial}`;
}

/** Codifica um valor para uso dentro de um caminho de URL. */
export function segmento(valor: string): string {
  return encodeURIComponent(valor);
}

/**
 * Valida e converte um corpo de resposta desconhecido no tipo esperado.
 * Tipos estaticos nao validam JSON recebido; por isso todo endpoint informa
 * seu parser e nao existe caminho que devolva `any` da rede.
 */
export type Parser<T> = (bruto: unknown) => T;

export interface RequestOptions {
  readonly method?: string;
  /** Corpo JSON. Exclusivo com `formData`. */
  readonly body?: unknown;
  /** Upload: o navegador define o boundary, entao nao definimos Content-Type. */
  readonly formData?: FormData;
  readonly signal?: AbortSignal;
  readonly accept?: string;
}

async function lerCorpo(response: Response): Promise<unknown> {
  const tipo = response.headers.get("content-type") ?? "";
  // Nem toda resposta e JSON; presumir isso e antipadrao explicito da
  // base de conhecimento (secao 19).
  if (!tipo.includes("application/json")) {
    return await response.text();
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function construirHeaders(options: RequestOptions): Headers {
  const headers = new Headers();
  headers.set("Accept", options.accept ?? "application/json");

  const token = lerToken();
  if (token !== null && token !== "") {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Content-Type so quando ha corpo JSON. Em FormData o navegador precisa
  // definir o proprio boundary.
  if (options.body !== undefined && options.formData === undefined) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

async function converterEmErro(response: Response): Promise<ApplicationError> {
  const corpo = await lerCorpo(response);
  const { message, fieldErrors } = flattenDetail(corpo);
  const categoria = categoryForStatus(response.status);
  const texto =
    message ??
    (typeof corpo === "string" && corpo.trim() !== ""
      ? corpo.trim()
      : `Falha na requisicao (HTTP ${String(response.status)}).`);
  return new ApplicationError(texto, categoria, response.status, fieldErrors);
}

/**
 * Executa uma requisicao e devolve a resposta ja validada.
 *
 * `parse` e obrigatorio para respostas com conteudo; use `semConteudo` para
 * endpoints 204.
 */
export async function request<T>(
  path: string,
  parse: Parser<T>,
  options: RequestOptions = {},
): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: construirHeaders(options),
  };
  if (options.signal !== undefined) init.signal = options.signal;
  if (options.formData !== undefined) init.body = options.formData;
  else if (options.body !== undefined) init.body = JSON.stringify(options.body);

  let response: Response;
  try {
    response = await fetch(resolverUrl(path), init);
  } catch (erro: unknown) {
    // Cancelamento nao e falha de rede; a UI trata os dois de formas
    // diferentes e por isso eles nao podem chegar com a mesma categoria.
    if (erro instanceof DOMException && erro.name === "AbortError") {
      throw new ApplicationError("Requisicao cancelada.", "cancelado");
    }
    throw new ApplicationError(
      "Nao foi possivel falar com o servidor. Verifique a conexao.",
      "rede",
    );
  }

  if (!response.ok) {
    throw await converterEmErro(response);
  }

  // 204 e 205 nao tem corpo; ler JSON aqui lancaria.
  if (response.status === 204 || response.status === 205) {
    return parse(null);
  }

  return parse(await lerCorpo(response));
}

/** Parser para endpoints que respondem sem conteudo. */
export const semConteudo: Parser<void> = () => undefined;

/** Baixa um binario preservando o Content-Type informado pelo servidor. */
export async function requestBlob(
  path: string,
  options: RequestOptions = {},
): Promise<{ blob: Blob; contentType: string }> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: construirHeaders({ ...options, accept: options.accept ?? "*/*" }),
  };
  if (options.signal !== undefined) init.signal = options.signal;

  let response: Response;
  try {
    response = await fetch(resolverUrl(path), init);
  } catch (erro: unknown) {
    if (erro instanceof DOMException && erro.name === "AbortError") {
      throw new ApplicationError("Requisicao cancelada.", "cancelado");
    }
    throw new ApplicationError(
      "Nao foi possivel falar com o servidor. Verifique a conexao.",
      "rede",
    );
  }

  if (!response.ok) {
    throw await converterEmErro(response);
  }

  return {
    blob: await response.blob(),
    // A renderizacao despacha por este valor, nunca pela extensao do arquivo.
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}
