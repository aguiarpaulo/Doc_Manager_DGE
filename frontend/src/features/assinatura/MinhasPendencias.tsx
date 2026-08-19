/**
 * Painel "aguardando minha assinatura".
 *
 * Consome `/me/signature-requests`, que por construção só devolve a fila de quem
 * chama — não há id de usuário no caminho. A tela não filtra nada: se filtrasse,
 * estaria compensando no cliente uma responsabilidade do servidor.
 */

import { useCallback } from "react";
import { Link } from "react-router-dom";

import * as api from "../../data/api.ts";
import type { PendenciaAssinatura } from "../../data/contracts.ts";
import { useApiData } from "../../data/useApiData.ts";

function formatar(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleString("pt-BR");
}

export function MinhasPendencias() {
  const buscar = useCallback((signal: AbortSignal) => api.minhasPendencias(signal), []);
  const { estado, recarregar } = useApiData<PendenciaAssinatura[]>(buscar, []);

  return (
    <section aria-labelledby="titulo-pendencias" className="pendencias">
      <h2 id="titulo-pendencias">Aguardando minha assinatura</h2>

      {estado.status === "loading" && <p role="status">Carregando pendências...</p>}

      {estado.status === "error" && (
        <p role="alert">
          {estado.error.message}{" "}
          <button type="button" onClick={recarregar}>
            Tentar novamente
          </button>
        </p>
      )}

      {/* Estado vazio próprio: nada a assinar não é falha, e é a situação
          normal da maioria dos dias. */}
      {estado.status === "empty" && (
        <p className="pendencias__vazio">
          Nenhum documento aguarda a sua assinatura no momento.
        </p>
      )}

      {estado.status === "success" && (
        <ul className="pendencias__lista">
          {estado.data.map(({ solicitacao, documento_nome }) => (
            <li key={solicitacao.id} data-testid="pendencia">
              <Link to={`/documentos/${solicitacao.document_id}/assinar`}>
                {documento_nome}
              </Link>{" "}
              <span className="pendencias__meta">
                página {solicitacao.pagina} · solicitado em{" "}
                {formatar(solicitacao.criado_em)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
