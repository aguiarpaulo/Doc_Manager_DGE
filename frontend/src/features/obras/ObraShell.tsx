/**
 * Shell no modelo do SEI.
 *
 * A **obra faz o papel do processo**: seus documentos aparecem a esquerda em
 * ordem de inclusao (mais antigo primeiro, como a arvore do SEI) e o
 * selecionado e renderizado ao lado, com a barra de acoes no topo do painel.
 *
 * O documento selecionado vive na URL, nao no estado do componente: isso torna
 * a tela compartilhavel e faz o F5 restaurar exatamente o que estava aberto.
 */

import { useCallback, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import * as api from "../../data/api.ts";
import type { Documento, Obra } from "../../data/contracts.ts";
import { useApiData } from "../../data/useApiData.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import { MinhasPendencias } from "../assinatura/MinhasPendencias.tsx";
import { FormularioUpload } from "../documentos/FormularioUpload.tsx";
import { PainelDocumento } from "../documentos/PainelDocumento.tsx";
import "./shell.css";

/** Ordem de inclusao: o mais antigo primeiro, como na arvore do processo. */
export function ordenarPorInclusao(documentos: readonly Documento[]): Documento[] {
  return [...documentos].sort((a, b) => {
    const diferenca = Date.parse(a.criado_em) - Date.parse(b.criado_em);
    // Datas iguais (ou ilegiveis) caem no id para manter ordem estavel.
    return diferenca !== 0 ? diferenca : a.id.localeCompare(b.id);
  });
}

function formatarData(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleString("pt-BR");
}

export function ObraShell() {
  const { obraId = "", documentoId } = useParams();
  const navigate = useNavigate();
  const { usuario, sair, ehAdministrador } = useAuth();

  const buscarObras = useCallback((signal: AbortSignal) => api.listarObras(signal), []);
  const obras = useApiData<Obra[]>(buscarObras, []);

  const buscarDocumentos = useCallback(
    (signal: AbortSignal) => api.listarDocumentos(obraId, signal),
    [obraId],
  );
  const documentos = useApiData<Documento[]>(buscarDocumentos, [obraId]);

  const ordenados = useMemo(
    () =>
      documentos.estado.status === "success"
        ? ordenarPorInclusao(documentos.estado.data)
        : [],
    [documentos.estado],
  );

  const obraAtual =
    obras.estado.status === "success"
      ? obras.estado.data.find((o) => o.id === obraId)
      : undefined;

  return (
    <div className="shell">
      <header className="shell__cabecalho">
        <h1 className="shell__marca">GED DGE</h1>

        <label htmlFor="seletor-obra">Obra</label>
        <select
          id="seletor-obra"
          value={obraId}
          onChange={(evento) => {
            navigate(`/obras/${evento.target.value}`);
          }}
        >
          {obras.estado.status === "success" &&
            obras.estado.data.map((obra) => (
              <option key={obra.id} value={obra.id}>
                {obra.nome}
              </option>
            ))}
        </select>

        <span className="shell__identidade">
          {usuario?.username} ({usuario?.role})
        </span>
        {ehAdministrador && <Link to="/administracao">Administracao</Link>}
        <button type="button" onClick={sair}>
          Sair
        </button>
      </header>

      <div className="shell__corpo">
        <nav className="shell__lista" aria-label="Documentos da obra">
          {/* Antes da lista da obra: o que espera a pessoa vale mais que o
              acervo, e some sozinho quando nao ha nada. */}
          <MinhasPendencias />

          {documentos.estado.status === "loading" && (
            <p className="estado-vazio" role="status">
              Carregando documentos...
            </p>
          )}

          {documentos.estado.status === "empty" && (
            // Resposta valida sem itens nao e falha: texto proprio, sem alerta.
            <p className="estado-vazio">
              Esta obra ainda nao tem documentos. Envie o primeiro para comecar.
            </p>
          )}

          {documentos.estado.status === "error" && (
            <p className="estado-vazio" role="alert">
              {documentos.estado.error.message}{" "}
              <button type="button" onClick={documentos.recarregar}>
                Tentar novamente
              </button>
            </p>
          )}

          {documentos.estado.status === "success" && (
            <ol className="lista-documentos">
              {ordenados.map((documento, indice) => (
                <li key={documento.id} className="lista-documentos__item">
                  <button
                    type="button"
                    className="lista-documentos__link"
                    aria-current={documento.id === documentoId ? "true" : undefined}
                    onClick={() => {
                      // Navegacao dentro da SPA: sem recarregar a pagina.
                      navigate(`/obras/${obraId}/documentos/${documento.id}`);
                    }}
                  >
                    <span className="lista-documentos__ordem">{indice + 1}</span>
                    {documento.nome}
                    <span className="lista-documentos__meta">
                      {documento.categoria} · {documento.status} ·{" "}
                      {formatarData(documento.criado_em)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <FormularioUpload obraId={obraId} aoConcluir={documentos.recarregar} />
        </nav>

        <section className="shell__painel" aria-label="Documento selecionado">
          {documentoId === undefined ? (
            <div className="shell__conteudo">
              <p className="estado-vazio">
                {obraAtual === undefined
                  ? "Selecione uma obra."
                  : `Selecione um documento de ${obraAtual.nome} na lista ao lado.`}
              </p>
            </div>
          ) : (
            <PainelDocumento documentoId={documentoId} />
          )}
        </section>
      </div>
    </div>
  );
}
