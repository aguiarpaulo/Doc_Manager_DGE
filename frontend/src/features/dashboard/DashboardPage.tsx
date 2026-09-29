/**
 * Painel inicial: sumario de cada obra acessivel, mais o que espera a
 * assinatura do usuario.
 *
 * Substitui o redirecionamento automatico que `EscolherObra` fazia — em vez de
 * cair direto na primeira obra, a pessoa ve o panorama e escolhe. A API ja
 * devolve o resumo escopado e limitado as 10 obras mais ativas (NODE
 * dashboard); nada aqui agrega no cliente.
 */

import { useCallback } from "react";
import { Link } from "react-router-dom";

import * as api from "../../data/api.ts";
import type { AtividadeObra, ResumoObra, StatusDocumento } from "../../data/contracts.ts";
import { useApiData } from "../../data/useApiData.ts";
import { Cabecalho } from "../../components/layout/Cabecalho.tsx";
import { StatusBadge } from "../../components/ui/StatusBadge.tsx";
import { MinhasPendencias } from "../assinatura/MinhasPendencias.tsx";
import "./dashboard.css";

const STATUS_EM_ORDEM: readonly StatusDocumento[] = [
  "enviado",
  "em_analise",
  "aprovado",
  "rejeitado",
];

/** Frase em voz ativa, no modelo que ClickSign/DS gov.br usam para um log de assinatura. */
const VERBOS: Record<string, string> = {
  upload: "enviou o documento",
  new_version: "enviou uma nova versão de",
  review: "colocou em análise",
  approve: "aprovou",
  reject: "rejeitou",
  delete: "excluiu",
  signature_requested: "solicitou assinatura de",
  signed: "assinou",
  signature_declined: "recusou assinar",
  signature_cancelled: "cancelou a solicitação de assinatura de",
};

function formatarData(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleString("pt-BR");
}

function descreverAtividade(atividade: AtividadeObra): string {
  const verbo = VERBOS[atividade.action] ?? atividade.action;
  const ator = atividade.actor_nome ?? "Alguém";
  return `${ator} ${verbo} "${atividade.document_nome}" · ${formatarData(atividade.created_at)}`;
}

export function DashboardPage() {
  const buscarResumo = useCallback((signal: AbortSignal) => api.resumoObras(signal), []);
  const resumo = useApiData<ResumoObra[]>(buscarResumo, []);

  return (
    <div className="painel-inicial">
      <Cabecalho />

      <div className="painel-inicial__corpo">
        <MinhasPendencias />

        <section aria-labelledby="titulo-obras" className="painel-inicial__obras">
          <h2 id="titulo-obras">Suas obras</h2>

          {resumo.estado.status === "loading" && (
            <p className="estado-vazio" role="status">
              Carregando obras...
            </p>
          )}

          {resumo.estado.status === "error" && (
            <p className="estado-vazio" role="alert">
              {resumo.estado.error.message}{" "}
              <button type="button" onClick={resumo.recarregar}>
                Tentar novamente
              </button>
            </p>
          )}

          {resumo.estado.status === "empty" && (
            // Instala nova sem obra ainda: orienta em vez de mostrar uma grade vazia.
            <p className="estado-vazio">
              Nenhuma obra cadastrada ainda. Um administrador precisa criar a
              primeira obra para que documentos possam ser enviados.
            </p>
          )}

          {resumo.estado.status === "success" && (
            <ul className="grade-obras">
              {resumo.estado.data.map((item) => (
                <li key={item.obra.id}>
                  <Link to={`/obras/${item.obra.id}`} className="cartao-obra">
                    <h3>{item.obra.nome}</h3>
                    <p className="cartao-obra__contagens">
                      {STATUS_EM_ORDEM.map((status) => (
                        <StatusBadge
                          key={status}
                          status={status}
                          contagem={item.by_status[status]}
                        />
                      ))}
                    </p>
                    <p className="cartao-obra__atividade">
                      {item.latest_activity
                        ? descreverAtividade(item.latest_activity)
                        : "Nenhuma atividade registrada ainda."}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
