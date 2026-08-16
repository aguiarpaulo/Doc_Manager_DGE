/**
 * Contratos da API em um unico lugar, cada um com seu parser de runtime.
 *
 * Uma interface TypeScript nao valida nada em tempo de execucao: tratar o JSON
 * recebido como confiavel so porque existe um tipo e antipadrao explicito da
 * base de conhecimento (secao 19). Por isso todo endpoint declara um parser, e
 * um payload fora do contrato falha na fronteira em vez de virar `undefined`
 * tres camadas adiante.
 *
 * Os parsers sao escritos a mao de proposito: o contrato tem poucas formas e
 * assim o bundle nao carrega uma biblioteca de validacao. Se a superficie
 * crescer, trocar por uma biblioteca dedicada e um refactor local a este
 * arquivo.
 */

import { ApplicationError } from "./errors.ts";

export type Papel = "administrador" | "diretor" | "engenheiro" | "financeiro";

export type StatusDocumento = "enviado" | "em_analise" | "aprovado" | "rejeitado";

/** Espelha `Category` em app/models/document.py. Enum fechado, nao texto livre. */
export type Categoria =
  | "contrato"
  | "projeto"
  | "nota_fiscal"
  | "licenca"
  | "laudo"
  | "outros";

export const CATEGORIAS: readonly Categoria[] = [
  "contrato",
  "projeto",
  "nota_fiscal",
  "licenca",
  "laudo",
  "outros",
];

/**
 * Tipos que `ALLOWED_CONTENT_TYPES` em app/services/uploads.py aceita. O gate
 * real e do servidor e casa pelo content type, nunca pela extensao; esta lista
 * so evita que o usuario suba um arquivo que ja se sabe que sera recusado.
 */
export const TIPOS_ACEITOS: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** Espelha MAX_FILE_SIZE em app/services/uploads.py. */
export const TAMANHO_MAXIMO = 50 * 1024 * 1024;

export interface Usuario {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly role: Papel;
  readonly is_active: boolean;
}

export interface Obra {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly is_deleted: boolean;
}

/**
 * Espelha `DocumentRead`. Note que a API **nao expoe** `approved_version`,
 * embora a coluna exista no modelo: declarar o campo aqui prometeria a UI um
 * dado que nunca chega.
 */
export interface Documento {
  readonly id: string;
  readonly nome: string;
  readonly obra_id: string;
  readonly categoria: Categoria;
  readonly status: StatusDocumento;
  readonly criado_por: string;
  readonly criado_em: string;
  readonly current_version: number;
}

/** Espelha `DocumentVersionRead`, devolvido por POST /documents/{id}/versions. */
export interface VersaoDocumento {
  readonly id: string;
  readonly document_id: string;
  readonly version: number;
  readonly tamanho: number;
  readonly tipo: string;
  readonly hash: string;
}

export interface Etapa {
  readonly id: string;
  readonly action: string;
  readonly actor_id: string | null;
  readonly target_id: string | null;
  readonly detail: string | null;
  readonly created_at: string;
}

export interface Tokens {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: string;
}

// --- primitivas de validacao -------------------------------------------------

function falhar(campo: string, esperado: string, recebido: unknown): never {
  throw new ApplicationError(
    `Resposta da API fora do contrato: "${campo}" deveria ser ${esperado}, veio ${typeof recebido}.`,
    "desconhecido",
  );
}

function objeto(bruto: unknown, contexto: string): Record<string, unknown> {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return falhar(contexto, "um objeto", bruto);
  }
  return bruto as Record<string, unknown>;
}

function texto(registro: Record<string, unknown>, campo: string): string {
  const valor = registro[campo];
  if (typeof valor !== "string") return falhar(campo, "texto", valor);
  return valor;
}

function textoOuNulo(registro: Record<string, unknown>, campo: string): string | null {
  const valor = registro[campo];
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") return falhar(campo, "texto ou nulo", valor);
  return valor;
}

function numero(registro: Record<string, unknown>, campo: string): number {
  const valor = registro[campo];
  if (typeof valor !== "number" || Number.isNaN(valor)) {
    return falhar(campo, "numero", valor);
  }
  return valor;
}

function booleano(registro: Record<string, unknown>, campo: string): boolean {
  const valor = registro[campo];
  if (typeof valor !== "boolean") return falhar(campo, "booleano", valor);
  return valor;
}

function umDentre<T extends string>(
  registro: Record<string, unknown>,
  campo: string,
  permitidos: readonly T[],
): T {
  const valor = texto(registro, campo);
  if (!permitidos.includes(valor as T)) {
    return falhar(campo, `um de [${permitidos.join(", ")}]`, valor);
  }
  return valor as T;
}

/** Aplica um parser de item a cada elemento de uma lista. */
export function lista<T>(parseItem: (bruto: unknown) => T) {
  return (bruto: unknown): T[] => {
    if (!Array.isArray(bruto)) return falhar("resposta", "uma lista", bruto);
    return bruto.map((item: unknown) => parseItem(item));
  };
}

// --- parsers de dominio ------------------------------------------------------

const PAPEIS: readonly Papel[] = [
  "administrador",
  "diretor",
  "engenheiro",
  "financeiro",
];

const STATUS: readonly StatusDocumento[] = [
  "enviado",
  "em_analise",
  "aprovado",
  "rejeitado",
];

export function parseUsuario(bruto: unknown): Usuario {
  const r = objeto(bruto, "usuario");
  return {
    id: texto(r, "id"),
    username: texto(r, "username"),
    email: texto(r, "email"),
    role: umDentre(r, "role", PAPEIS),
    is_active: booleano(r, "is_active"),
  };
}

export function parseObra(bruto: unknown): Obra {
  const r = objeto(bruto, "obra");
  return {
    id: texto(r, "id"),
    nome: texto(r, "nome"),
    descricao: textoOuNulo(r, "descricao"),
    is_deleted: typeof r["is_deleted"] === "boolean" ? r["is_deleted"] : false,
  };
}

export function parseDocumento(bruto: unknown): Documento {
  const r = objeto(bruto, "documento");
  return {
    id: texto(r, "id"),
    nome: texto(r, "nome"),
    obra_id: texto(r, "obra_id"),
    categoria: umDentre(r, "categoria", CATEGORIAS),
    status: umDentre(r, "status", STATUS),
    criado_por: texto(r, "criado_por"),
    criado_em: texto(r, "criado_em"),
    current_version: numero(r, "current_version"),
  };
}

export function parseVersaoDocumento(bruto: unknown): VersaoDocumento {
  const r = objeto(bruto, "versao");
  return {
    id: texto(r, "id"),
    document_id: texto(r, "document_id"),
    version: numero(r, "version"),
    tamanho: numero(r, "tamanho"),
    tipo: texto(r, "tipo"),
    hash: texto(r, "hash"),
  };
}

export function parseEtapa(bruto: unknown): Etapa {
  const r = objeto(bruto, "etapa");
  return {
    id: texto(r, "id"),
    action: texto(r, "action"),
    actor_id: textoOuNulo(r, "actor_id"),
    target_id: textoOuNulo(r, "target_id"),
    detail: textoOuNulo(r, "detail"),
    created_at: texto(r, "created_at"),
  };
}

export function parseTokens(bruto: unknown): Tokens {
  const r = objeto(bruto, "tokens");
  return {
    access_token: texto(r, "access_token"),
    refresh_token: texto(r, "refresh_token"),
    token_type: typeof r["token_type"] === "string" ? r["token_type"] : "bearer",
  };
}

export const parseUsuarios = lista(parseUsuario);
export const parseObras = lista(parseObra);
export const parseDocumentos = lista(parseDocumento);
export const parseEtapas = lista(parseEtapa);
