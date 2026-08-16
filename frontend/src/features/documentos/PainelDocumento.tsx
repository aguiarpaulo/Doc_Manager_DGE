/**
 * Painel do documento selecionado: barra de acoes no topo e conteudo abaixo.
 *
 * Baixa a versao corrente e entrega ao visualizador junto com o Content-Type
 * que o servidor informou — a decisao de como renderizar e daquele valor, nunca
 * do nome do arquivo.
 */

import { useCallback } from "react";

import * as api from "../../data/api.ts";
import type { Documento } from "../../data/contracts.ts";
import { useApiData } from "../../data/useApiData.ts";
import { AcoesDocumento } from "./AcoesDocumento.tsx";
import { VisualizadorConteudo } from "./VisualizadorConteudo.tsx";

interface ConteudoBaixado {
  readonly blob: Blob;
  readonly contentType: string;
}

export function PainelDocumento({ documentoId }: { documentoId: string }) {
  const buscarDocumento = useCallback(
    (signal: AbortSignal) => api.obterDocumento(documentoId, signal),
    [documentoId],
  );
  const documento = useApiData<Documento>(buscarDocumento, [documentoId]);

  const versao =
    documento.estado.status === "success" ? documento.estado.data.current_version : null;

  const buscarConteudo = useCallback((): Promise<ConteudoBaixado> => {
    if (versao === null) return Promise.reject(new Error("sem versao"));
    return api.baixarVersao(documentoId, versao);
  }, [documentoId, versao]);

  const conteudo = useApiData<ConteudoBaixado>(buscarConteudo, [documentoId, versao]);

  if (documento.estado.status === "loading") {
    return (
      <div className="shell__conteudo">
        <p role="status">Carregando documento...</p>
      </div>
    );
  }

  if (documento.estado.status === "error") {
    return (
      <div className="shell__conteudo">
        <p role="alert">{documento.estado.error.message}</p>
        <button type="button" onClick={documento.recarregar}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (documento.estado.status !== "success") {
    return (
      <div className="shell__conteudo">
        <p className="estado-vazio">Documento indisponivel.</p>
      </div>
    );
  }

  const atual = documento.estado.data;

  return (
    <>
      <AcoesDocumento
        documento={atual}
        aoMudar={documento.definirDados}
        aoEnviarVersao={documento.recarregar}
      />

      <div className="shell__conteudo">
        {conteudo.estado.status === "loading" && (
          <p role="status">Carregando conteudo...</p>
        )}

        {conteudo.estado.status === "error" && (
          <p role="alert">{conteudo.estado.error.message}</p>
        )}

        {conteudo.estado.status === "success" && (
          <VisualizadorConteudo
            nome={atual.nome}
            blob={conteudo.estado.data.blob}
            contentType={conteudo.estado.data.contentType}
          />
        )}
      </div>
    </>
  );
}
