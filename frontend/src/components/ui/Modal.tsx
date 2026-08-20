/**
 * Diálogo modal acessível.
 *
 * Promovido a `components/ui` porque o contrato é genérico e estável — a §4 da
 * base de conhecimento só admite essa promoção nesse caso.
 *
 * Implementa o que a §12.3 enumera, e cada item existe por um motivo concreto:
 *
 * - renderizado por **portal**, acima da árvore visual, para não herdar
 *   `overflow` ou `z-index` de quem o abriu;
 * - `role="dialog"` + `aria-modal` + título associado, senão um leitor de tela
 *   anuncia um punhado de campos sem contexto;
 * - **foco movido para dentro** ao abrir e **restaurado** ao fechar, para quem
 *   navega por teclado não voltar ao topo da página;
 * - **Tab preso** dentro do diálogo, senão o foco escapa para o fundo que o
 *   usuário não consegue ver;
 * - **Escape fecha**;
 * - fundo marcado como `inert`, para não ser alcançável nem por teclado nem por
 *   leitor de tela.
 */

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import "./modal.css";

export interface ModalProps {
  readonly titulo: string;
  readonly aberto: boolean;
  readonly aoFechar: () => void;
  readonly children: React.ReactNode;
}

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ titulo, aberto, aoFechar, children }: ModalProps) {
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const focoAnteriorRef = useRef<HTMLElement | null>(null);
  const tituloId = useId();

  useEffect(() => {
    if (!aberto) return;

    // Guarda quem tinha o foco para devolvê-lo ao fechar.
    focoAnteriorRef.current = document.activeElement as HTMLElement | null;

    const caixa = caixaRef.current;
    const primeiro = caixa?.querySelector<HTMLElement>(FOCAVEIS);
    (primeiro ?? caixa)?.focus();

    // Tudo que não é o próprio diálogo fica inerte enquanto ele existe. Marcar
    // os irmãos, em vez de um `#root` fixo, evita depender de um id que pode
    // não existir (e não existe numa árvore de teste).
    const portal = caixa?.closest(".modal__fundo") ?? null;
    const inertados = Array.from(document.body.children).filter(
      (filho) => filho !== portal && !filho.hasAttribute("inert"),
    );
    inertados.forEach((filho) => {
      filho.setAttribute("inert", "");
    });

    return () => {
      inertados.forEach((filho) => {
        filho.removeAttribute("inert");
      });
      focoAnteriorRef.current?.focus?.();
    };
  }, [aberto]);

  const aoTeclar = useCallback(
    (evento: React.KeyboardEvent<HTMLDivElement>) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        aoFechar();
        return;
      }
      if (evento.key !== "Tab") return;

      const caixa = caixaRef.current;
      if (!caixa) return;
      const focaveis = Array.from(caixa.querySelectorAll<HTMLElement>(FOCAVEIS));
      if (focaveis.length === 0) return;

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!primeiro || !ultimo) return;

      // Prende o ciclo: do último volta ao primeiro e vice-versa.
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    },
    [aoFechar],
  );

  if (!aberto) return null;

  return createPortal(
    <div className="modal__fundo">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        ref={caixaRef}
        tabIndex={-1}
        onKeyDown={aoTeclar}
      >
        <h2 id={tituloId}>{titulo}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
