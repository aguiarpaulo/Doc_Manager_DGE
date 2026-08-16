/**
 * Estado remoto como uniao discriminada.
 *
 * A distincao que este tipo forca existir e a que a base de conhecimento
 * (secao 9) trata como obrigatoria: `loading` e a primeira carga sem dados na
 * tela, `revalidating` e uma atualizacao em segundo plano com dados ja
 * visiveis. Mostrar o mesmo spinner para os dois e antipadrao — o usuario ve a
 * tela piscar a cada revalidacao.
 *
 * `empty` tambem e um estado proprio: resposta valida sem itens nao e falha, e
 * confundir os dois produz "erro ao carregar" quando na verdade nao ha nada
 * cadastrado ainda.
 */

import type { ApplicationError } from "./errors.ts";

export type RemoteState<T> =
  | { readonly status: "loading" }
  | { readonly status: "empty" }
  | { readonly status: "success"; readonly data: T; readonly revalidating: boolean }
  | { readonly status: "error"; readonly error: ApplicationError };

/** Verdadeiro quando ha dados exibiveis, mesmo durante uma revalidacao. */
export function temDados<T>(
  estado: RemoteState<T>,
): estado is { status: "success"; data: T; revalidating: boolean } {
  return estado.status === "success";
}

/**
 * Um indicador discreto de atualizacao deve aparecer apenas neste caso; a
 * primeira carga usa skeleton, nao o mesmo indicador.
 */
export function estaRevalidando<T>(estado: RemoteState<T>): boolean {
  return estado.status === "success" && estado.revalidating;
}
