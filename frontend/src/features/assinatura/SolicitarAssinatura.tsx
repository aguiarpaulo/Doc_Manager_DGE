/**
 * Solicitar assinatura: escolher onde e para quem.
 *
 * Só aparece para PDF. A regra real é do servidor (`SIGNABLE_CONTENT_TYPES`), e
 * aqui ela evita oferecer uma ação que a API recusaria — o despacho é pelo
 * Content-Type que o download devolveu, nunca pelo nome do arquivo.
 */

import { useCallback, useState } from "react";

import * as api from "../../data/api.ts";
import type { Usuario } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { VisualizadorPdf, type AreaNormalizada } from "./VisualizadorPdf.tsx";
import "./assinatura.css";

export interface SolicitarAssinaturaProps {
  readonly documentoId: string;
  readonly contentType: string;
  readonly arquivo: Blob;
  readonly candidatos: readonly Usuario[];
  readonly aoSolicitar: () => void;
}

export function SolicitarAssinatura({
  documentoId,
  contentType,
  arquivo,
  candidatos,
  aoSolicitar,
}: SolicitarAssinaturaProps) {
  const [area, setArea] = useState<AreaNormalizada | null>(null);
  const [signatarioId, setSignatarioId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const aoMarcar = useCallback((nova: AreaNormalizada) => {
    setArea(nova);
    setErro(null);
  }, []);

  const ehPdf = contentType.split(";")[0]?.trim().toLowerCase() === "application/pdf";
  if (!ehPdf) {
    return (
      <p className="assinatura__indisponivel">
        Só é possível marcar área de assinatura em PDF. Este documento é{" "}
        {contentType || "de tipo desconhecido"}.
      </p>
    );
  }

  async function solicitar() {
    if (enviando) return;
    if (area === null) {
      setErro("Marque na página onde a assinatura deve ficar.");
      return;
    }
    if (signatarioId === "") {
      setErro("Escolha quem deve assinar.");
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      await api.solicitarAssinatura(documentoId, {
        signatarioId,
        pagina: area.pagina,
        x: area.x,
        y: area.y,
        largura: area.largura,
        altura: area.altura,
        pageWidth: area.pageWidth,
        pageHeight: area.pageHeight,
      });
      setArea(null);
      setSignatarioId("");
      aoSolicitar();
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError
          ? falha.message
          : "Não foi possível solicitar a assinatura.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-labelledby="titulo-solicitar" className="assinatura">
      <h2 id="titulo-solicitar">Solicitar assinatura</h2>

      {erro !== null && <p role="alert">{erro}</p>}

      <VisualizadorPdf arquivo={arquivo} aoMarcar={aoMarcar} areaAtual={area} />

      {area !== null && (
        <p data-testid="resumo-area">
          Área na página {area.pagina}: {(area.largura * 100).toFixed(0)}% ×{" "}
          {(area.altura * 100).toFixed(0)}% da página.
        </p>
      )}

      <label htmlFor="seletor-signatario">Quem deve assinar</label>
      <select
        id="seletor-signatario"
        value={signatarioId}
        onChange={(e) => {
          setSignatarioId(e.target.value);
        }}
      >
        <option value="">selecione</option>
        {candidatos.map((u) => (
          <option key={u.id} value={u.id}>
            {u.username}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => void solicitar()}
        disabled={enviando || area === null || signatarioId === ""}
      >
        {enviando ? "Solicitando..." : "Solicitar assinatura"}
      </button>
    </section>
  );
}
