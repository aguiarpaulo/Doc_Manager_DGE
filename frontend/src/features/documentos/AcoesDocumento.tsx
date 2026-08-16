/**
 * Barra de acoes do documento: download, nova versao e fluxo de aprovacao.
 *
 * A UI **nao reimplementa a maquina de estados** de app/services/approval.py.
 * Ela oferece a acao, e uma transicao invalida volta como 409 da API e e
 * mostrada como erro acionavel — em vez de a tela decidir sozinha o que e
 * permitido e divergir do servidor com o tempo.
 *
 * A regra de que o criador nao decide sobre a propria submissao tambem e do
 * servidor; aqui ela aparece como o 403 que ele devolve.
 */

import { useState } from "react";

import * as api from "../../data/api.ts";
import type { Documento } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";

export interface AcoesDocumentoProps {
  readonly documento: Documento;
  readonly aoMudar: (documento: Documento) => void;
  readonly aoEnviarVersao: () => void;
}

export function AcoesDocumento({
  documento,
  aoMudar,
  aoEnviarVersao,
}: AcoesDocumentoProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function executar(acao: () => Promise<Documento>) {
    if (ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      // A resposta ja traz a entidade atualizada: atualiza local em vez de
      // buscar de novo.
      aoMudar(await acao());
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError
          ? falha.message
          : "Nao foi possivel concluir a acao.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function baixar() {
    setErro(null);
    try {
      const { blob } = await api.baixarVersao(documento.id, documento.current_version);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = documento.nome;
      link.click();
      URL.revokeObjectURL(url);
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError ? falha.message : "Falha ao baixar o arquivo.",
      );
    }
  }

  async function novaVersao(arquivo: File) {
    setErro(null);
    setOcupado(true);
    try {
      await api.enviarVersao(documento.id, arquivo);
      // Nova versao devolve DocumentVersionRead; o documento precisa ser relido
      // para refletir current_version e o status de volta em "enviado".
      aoEnviarVersao();
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError
          ? falha.message
          : "Nao foi possivel enviar a nova versao.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="shell__acoes">
      <strong>{documento.nome}</strong>
      <span>
        versao {documento.current_version} · {documento.status}
      </span>

      <button type="button" onClick={() => void baixar()}>
        Baixar
      </button>

      <label htmlFor="campo-nova-versao">Nova versao</label>
      <input
        id="campo-nova-versao"
        type="file"
        disabled={ocupado}
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void novaVersao(arquivo);
        }}
      />

      <button
        type="button"
        disabled={ocupado}
        onClick={() => void executar(() => api.iniciarAnalise(documento.id))}
      >
        Enviar para analise
      </button>
      <button
        type="button"
        disabled={ocupado}
        onClick={() => void executar(() => api.aprovarDocumento(documento.id))}
      >
        Aprovar
      </button>
      <button
        type="button"
        disabled={ocupado}
        onClick={() => void executar(() => api.rejeitarDocumento(documento.id))}
      >
        Rejeitar
      </button>

      {erro !== null && <p role="alert">{erro}</p>}
    </div>
  );
}
