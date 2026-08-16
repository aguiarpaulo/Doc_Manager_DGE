/**
 * Formato unico de erro da aplicacao.
 *
 * A UI nunca inspeciona status HTTP: ela decide pelo `category`. Isso mantem o
 * conhecimento do protocolo dentro da fronteira de dados, que e o unico lugar
 * que deveria saber que existe HTTP.
 */

export type ErrorCategory =
  | "autenticacao"
  | "autorizacao"
  | "validacao"
  | "conflito"
  | "nao-encontrado"
  | "indisponivel"
  | "rede"
  | "cancelado"
  | "desconhecido";

/** Erro por campo, como o FastAPI devolve em uma resposta 422. */
export interface FieldError {
  readonly campo: string;
  readonly mensagem: string;
}

export class ApplicationError extends Error {
  readonly category: ErrorCategory;
  readonly status: number | null;
  readonly fieldErrors: readonly FieldError[];

  constructor(
    message: string,
    category: ErrorCategory,
    status: number | null = null,
    fieldErrors: readonly FieldError[] = [],
  ) {
    super(message);
    this.name = "ApplicationError";
    this.category = category;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function categoryForStatus(status: number): ErrorCategory {
  if (status === 401) return "autenticacao";
  if (status === 403) return "autorizacao";
  if (status === 404) return "nao-encontrado";
  if (status === 409) return "conflito";
  if (status === 422) return "validacao";
  if (status >= 500) return "indisponivel";
  return "desconhecido";
}

/**
 * Achata as duas formas de `detail` que o FastAPI emite: uma string para erro
 * de negocio e uma lista por campo para erro de validacao. A UI recebe sempre
 * um texto exibivel, e os campos ficam disponiveis a parte para destacar o
 * formulario.
 */
export function flattenDetail(body: unknown): {
  message: string | null;
  fieldErrors: FieldError[];
} {
  if (typeof body !== "object" || body === null || !("detail" in body)) {
    return { message: null, fieldErrors: [] };
  }

  const detail: unknown = (body as { detail: unknown }).detail;

  if (typeof detail === "string") {
    return { message: detail, fieldErrors: [] };
  }

  if (Array.isArray(detail)) {
    const fieldErrors: FieldError[] = detail.map((item: unknown) => {
      if (typeof item !== "object" || item === null) {
        return { campo: "", mensagem: String(item) };
      }
      const registro = item as { loc?: unknown; msg?: unknown };
      // `loc` comeca com o local ("body", "query"); o nome do campo vem depois.
      const campo = Array.isArray(registro.loc)
        ? registro.loc
            .slice(1)
            .map((parte: unknown) => String(parte))
            .join(".")
        : "";
      return { campo, mensagem: String(registro.msg ?? "") };
    });

    const message = fieldErrors
      .map((erro) => (erro.campo ? `${erro.campo}: ${erro.mensagem}` : erro.mensagem))
      .join("; ");

    return { message: message || null, fieldErrors };
  }

  return { message: detail == null ? null : String(detail), fieldErrors: [] };
}
