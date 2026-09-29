/**
 * Selo de status de documento: contagem + rotulo + simbolo.
 *
 * A cor nunca e o unico sinal (WCAG 1.4.1) — o texto e o simbolo carregam o
 * significado, a cor so reforca. As cores usadas (--color-success/-warning/
 * -danger sobre --color-surface) ja estao na lista de combinacoes aprovadas
 * de acessibilidade.test.tsx; nenhum token novo foi criado para este selo.
 */

import type { StatusDocumento } from "../../data/contracts.ts";
import "./status-badge.css";

const ROTULOS: Record<StatusDocumento, string> = {
  enviado: "Enviado",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

const SIMBOLOS: Record<StatusDocumento, string> = {
  enviado: "○",
  em_analise: "◐",
  aprovado: "✓",
  rejeitado: "✕",
};

export function StatusBadge({
  status,
  contagem,
}: {
  status: StatusDocumento;
  contagem: number;
}) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      <span aria-hidden="true">{SIMBOLOS[status]}</span> {contagem} {ROTULOS[status]}
    </span>
  );
}
