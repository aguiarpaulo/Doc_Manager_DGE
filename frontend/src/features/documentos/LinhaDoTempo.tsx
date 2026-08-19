/**
 * Linha do tempo do documento, dentro da pasta da obra.
 *
 * Cada etapa é um evento com autor e horário, vindo do log imutável da API. A
 * tela não interpreta nem reordena nada: o servidor devolve em ordem cronológica
 * e é ele quem sabe o que aconteceu.
 *
 * Um documento recém-enviado tem **uma** etapa, não nenhuma. Por isso não existe
 * estado "vazio" aqui: a lista mínima já é informação — mostra quando e por quem
 * o documento entrou.
 */

import { useCallback } from "react";

import * as api from "../../data/api.ts";
import type { Etapa } from "../../data/contracts.ts";
import { useApiData } from "../../data/useApiData.ts";

/** Rótulos legíveis para as ações que o `AuditAction` do servidor emite. */
const ROTULOS: Record<string, string> = {
  upload: "Documento enviado",
  new_version: "Nova versão enviada",
  review: "Enviado para análise",
  approve: "Aprovado",
  reject: "Rejeitado",
  download: "Baixado",
  delete: "Excluído",
  signature_requested: "Assinatura solicitada",
  signed: "Assinado",
  signature_declined: "Assinatura recusada",
  signature_cancelled: "Solicitação cancelada",
  login: "Login",
};

export function rotuloDaEtapa(action: string): string {
  // Ação desconhecida aparece como veio, em vez de sumir da linha do tempo: uma
  // etapa que o cliente não reconhece ainda aconteceu.
  return ROTULOS[action] ?? action;
}

function formatar(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleString("pt-BR");
}

export function LinhaDoTempo({ documentoId }: { documentoId: string }) {
  const buscar = useCallback(
    (signal: AbortSignal) => api.historicoDocumento(documentoId, signal),
    [documentoId],
  );
  const { estado, recarregar } = useApiData<Etapa[]>(buscar, [documentoId]);

  return (
    <section aria-labelledby="titulo-etapas" className="linha-do-tempo">
      <h3 id="titulo-etapas">Etapas</h3>

      {estado.status === "loading" && (
        <p role="status">Carregando as etapas...</p>
      )}

      {estado.status === "error" && (
        <p role="alert">
          {estado.error.message}{" "}
          <button type="button" onClick={recarregar}>
            Tentar novamente
          </button>
        </p>
      )}

      {/* Um documento sempre tem ao menos a etapa de envio; se a API devolver
          lista vazia, é porque o documento ainda não recebeu arquivo. */}
      {estado.status === "empty" && (
        <p>Nenhuma etapa ainda — este documento não tem arquivo enviado.</p>
      )}

      {estado.status === "success" && (
        <>
          {estado.revalidating && (
            <p role="status" aria-live="polite" className="linha-do-tempo__atualizando">
              Atualizando...
            </p>
          )}
          <ol className="linha-do-tempo__lista">
            {estado.data.map((etapa) => (
              <li key={etapa.id} data-testid="etapa" data-acao={etapa.action}>
                <strong>{rotuloDaEtapa(etapa.action)}</strong>
                <span className="linha-do-tempo__autor">
                  {" "}
                  por {etapa.actor_nome ?? "sistema"}
                </span>
                <time dateTime={etapa.created_at}> em {formatar(etapa.created_at)}</time>
                {etapa.detail !== null && etapa.detail !== "" && (
                  <span className="linha-do-tempo__detalhe"> — {etapa.detail}</span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
