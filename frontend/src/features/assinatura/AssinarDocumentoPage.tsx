/**
 * Tela de assinatura — o destino do link enviado por e-mail.
 *
 * A rota é `/documentos/:documentoId/assinar`, exatamente o que
 * `signature_link` monta no servidor. Ela fica dentro da rota protegida, então
 * abrir o link sem sessão cai no login e volta para cá depois de autenticar:
 * a mecânica de `state.de` construída no NODE-020.
 *
 * A confirmação por senha acontece num modal com trap de foco. A senha vive
 * apenas no estado local do componente enquanto o modal está aberto e é
 * descartada logo depois — nunca é persistida nem registrada.
 */

import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";

import { Modal } from "../../components/ui/Modal.tsx";
import * as api from "../../data/api.ts";
import type {
  AssinaturaAplicada,
  Documento,
  SolicitacaoAssinatura,
} from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { aguardandoDependencia, useApiData } from "../../data/useApiData.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import { VisualizadorPdf, type AreaNormalizada } from "./VisualizadorPdf.tsx";
import "./assinatura.css";

interface ConteudoBaixado {
  readonly blob: Blob;
  readonly contentType: string;
}

function formatar(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleString("pt-BR");
}

export function AssinarDocumentoPage() {
  const { documentoId = "" } = useParams();
  const { usuario } = useAuth();

  const buscarDocumento = useCallback(
    (signal: AbortSignal) => api.obterDocumento(documentoId, signal),
    [documentoId],
  );
  const documento = useApiData<Documento>(buscarDocumento, [documentoId]);

  const buscarSolicitacoes = useCallback(
    (signal: AbortSignal) => api.listarSolicitacoes(documentoId, signal),
    [documentoId],
  );
  const solicitacoes = useApiData<SolicitacaoAssinatura[]>(buscarSolicitacoes, [
    documentoId,
  ]);

  // O conteudo so e baixado quando ha versao, e serve para o signatario LER o
  // documento antes de confirmar — decisao do GAP-008.
  const versao =
    documento.estado.status === "success" ? documento.estado.data.current_version : null;
  const buscarConteudo = useCallback((): Promise<ConteudoBaixado> => {
    if (versao === null) return aguardandoDependencia();
    return api.baixarVersao(documentoId, versao);
  }, [documentoId, versao]);
  const conteudo = useApiData<ConteudoBaixado>(buscarConteudo, [documentoId, versao]);

  const buscarAssinaturas = useCallback(
    (signal: AbortSignal) => api.listarAssinaturas(documentoId, signal),
    [documentoId],
  );
  const assinaturas = useApiData<AssinaturaAplicada[]>(buscarAssinaturas, [documentoId]);

  const [modalAberto, setModalAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [recusaAberta, setRecusaAberta] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erroRecusa, setErroRecusa] = useState<string | null>(null);
  const [recusando, setRecusando] = useState(false);

  const minhaPendencia =
    solicitacoes.estado.status === "success"
      ? solicitacoes.estado.data.find(
          (s) => s.status === "pendente" && s.signatario_id === usuario?.id,
        )
      : undefined;

  // A area que o solicitante marcou, no formato que o visualizador entende. So
  // destacada: a rubrica em si e desenhada pelo servidor, no PDF baixado.
  const areaMarcada: AreaNormalizada | null =
    minhaPendencia === undefined
      ? null
      : {
          pagina: minhaPendencia.pagina,
          x: minhaPendencia.x,
          y: minhaPendencia.y,
          largura: minhaPendencia.largura,
          altura: minhaPendencia.altura,
          pageWidth: minhaPendencia.page_width,
          pageHeight: minhaPendencia.page_height,
        };


  function fechar() {
    setModalAberto(false);
    // A senha some do estado assim que o diálogo fecha.
    setSenha("");
    setErro(null);
  }

  async function confirmar() {
    if (enviando || !minhaPendencia) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.assinarSolicitacao(documentoId, minhaPendencia.id, senha);
      setSenha("");
      setModalAberto(false);
      solicitacoes.recarregar();
      assinaturas.recarregar();
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError
          ? falha.message
          : "Não foi possível assinar. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  }

  function fecharRecusa() {
    setRecusaAberta(false);
    setMotivo("");
    setErroRecusa(null);
  }

  async function recusar() {
    if (recusando || !minhaPendencia) return;
    // Sem motivo o solicitante fica sem nada em que agir; a API tambem recusa.
    if (motivo.trim() === "") {
      setErroRecusa("Informe o motivo da recusa.");
      return;
    }
    setErroRecusa(null);
    setRecusando(true);
    try {
      await api.recusarSolicitacao(documentoId, minhaPendencia.id, motivo.trim());
      fecharRecusa();
      solicitacoes.recarregar();
    } catch (falha: unknown) {
      // O texto digitado permanece: reescreve-lo seria punir quem ja explicou.
      setErroRecusa(
        falha instanceof ApplicationError
          ? falha.message
          : "Nao foi possivel recusar. Tente novamente.",
      );
    } finally {
      setRecusando(false);
    }
  }

  if (documento.estado.status === "loading") {
    return <p role="status">Carregando documento...</p>;
  }
  if (documento.estado.status === "error") {
    return (
      <main>
        <h1>Assinar documento</h1>
        <p role="alert">{documento.estado.error.message}</p>
      </main>
    );
  }
  if (documento.estado.status !== "success") {
    return <p role="status">Carregando documento...</p>;
  }

  const atual = documento.estado.data;
  const listaAssinaturas =
    assinaturas.estado.status === "success" ? assinaturas.estado.data : [];

  return (
    <main className="assinar">
      <h1>Assinar documento</h1>
      <p>
        <strong>{atual.nome}</strong> — versão {atual.current_version}
      </p>

      {minhaPendencia === undefined ? (
        <p className="assinar__sem-pendencia">
          Não há assinatura pendente para você neste documento.
        </p>
      ) : (
        <>
          <p>
            Você foi indicado para assinar na página {minhaPendencia.pagina}.
          </p>
          <div className="assinar__acoes">
            <button
              type="button"
              onClick={() => {
                setModalAberto(true);
              }}
            >
              Assinar documento
            </button>
            {/* Recusar so aparece para quem e o signatario indicado — a mesma
                condicao que faz o bloco inteiro existir. */}
            <button
              type="button"
              onClick={() => {
                setRecusaAberta(true);
              }}
            >
              Recusar assinatura
            </button>
          </div>
        </>
      )}

      <section aria-labelledby="titulo-documento">
        <h2 id="titulo-documento">O documento</h2>
        {conteudo.estado.status === "loading" && (
          <p role="status">Carregando o documento...</p>
        )}
        {conteudo.estado.status === "error" && (
          <p role="alert">{conteudo.estado.error.message}</p>
        )}
        {conteudo.estado.status === "success" &&
          (conteudo.estado.data.contentType.split(";")[0]?.trim().toLowerCase() ===
          "application/pdf" ? (
            <VisualizadorPdf
              arquivo={conteudo.estado.data.blob}
              areaAtual={areaMarcada}
              // Abre na pagina marcada: quem assina nao deveria ter de procurar
              // onde a assinatura foi pedida.
              paginaInicial={areaMarcada?.pagina ?? 1}
              // Nesta tela a area nao e editavel: quem assina le, nao remarca.
              aoMarcar={() => undefined}
            />
          ) : (
            <p data-testid="sem-previa">
              Este documento nao e PDF ({conteudo.estado.data.contentType}) e nao
              tem previa. As informacoes acima descrevem o que sera assinado.
            </p>
          ))}
      </section>

      <section aria-labelledby="titulo-assinaturas">
        <h2 id="titulo-assinaturas">Assinaturas neste documento</h2>
        {listaAssinaturas.length === 0 ? (
          <p>Nenhuma assinatura ainda.</p>
        ) : (
          <ul>
            {listaAssinaturas.map((a) => (
              <li key={a.id} data-testid="assinatura-registrada">
                {a.signatario_nome} — {formatar(a.assinado_em)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        titulo="Recusar a assinatura"
        aberto={recusaAberta}
        aoFechar={fecharRecusa}
      >
        <p>
          Diga por que você não vai assinar. O motivo fica registrado na linha do
          tempo do documento e é enviado a quem solicitou.
        </p>

        {erroRecusa !== null && <p role="alert">{erroRecusa}</p>}

        <label htmlFor="motivo-recusa">Motivo</label>
        <textarea
          id="motivo-recusa"
          rows={3}
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
          }}
        />

        <div className="modal__acoes">
          <button type="button" onClick={fecharRecusa} disabled={recusando}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void recusar()}
            disabled={recusando || motivo.trim() === ""}
          >
            {recusando ? "Recusando..." : "Confirmar recusa"}
          </button>
        </div>
      </Modal>

      <Modal titulo="Confirme sua senha para assinar" aberto={modalAberto} aoFechar={fechar}>
        <p>
          Assinar é um ato pessoal. Digite a sua senha para confirmar que é você.
        </p>

        {erro !== null && <p role="alert">{erro}</p>}

        <label htmlFor="senha-assinatura">Senha</label>
        <input
          id="senha-assinatura"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
          }}
        />

        <div className="modal__acoes">
          <button type="button" onClick={fechar} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={enviando || senha === ""}
          >
            {enviando ? "Assinando..." : "Confirmar assinatura"}
          </button>
        </div>
      </Modal>
    </main>
  );
}
