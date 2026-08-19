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
import { useApiData } from "../../data/useApiData.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import "./assinatura.css";

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

  const buscarAssinaturas = useCallback(
    (signal: AbortSignal) => api.listarAssinaturas(documentoId, signal),
    [documentoId],
  );
  const assinaturas = useApiData<AssinaturaAplicada[]>(buscarAssinaturas, [documentoId]);

  const [modalAberto, setModalAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const minhaPendencia =
    solicitacoes.estado.status === "success"
      ? solicitacoes.estado.data.find(
          (s) => s.status === "pendente" && s.signatario_id === usuario?.id,
        )
      : undefined;

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
          <button
            type="button"
            onClick={() => {
              setModalAberto(true);
            }}
          >
            Assinar documento
          </button>
        </>
      )}

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
