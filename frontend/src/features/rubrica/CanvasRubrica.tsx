/**
 * Area de desenho da rubrica.
 *
 * Usa **Pointer Events**, nao mouse + touch separados: um unico conjunto de
 * manipuladores cobre mouse, dedo e caneta, que e o que se usa num tablet no
 * canteiro. Tratar os tres com codigos diferentes e como se ganha um traco que
 * funciona na mesa e falha na obra.
 *
 * O componente nao sabe o que e uma rubrica nem fala com a rede: ele desenha e
 * entrega bytes. Quem decide o que fazer com eles e a pagina.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface CanvasRubricaProps {
  readonly largura?: number;
  readonly altura?: number;
  /** Chamado quando o traco muda, para a pagina saber se ha algo a salvar. */
  readonly aoDesenhar?: (temTraco: boolean) => void;
}

export interface CanvasRubricaHandle {
  readonly estaVazio: () => boolean;
  readonly limpar: () => void;
  readonly paraPng: () => Promise<Blob | null>;
}

export function CanvasRubrica({
  largura = 480,
  altura = 180,
  aoDesenhar,
  ref,
}: CanvasRubricaProps & { ref?: React.Ref<CanvasRubricaHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desenhandoRef = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  const contexto = useCallback((): CanvasRenderingContext2D | null => {
    return canvasRef.current?.getContext("2d") ?? null;
  }, []);

  useEffect(() => {
    const ctx = contexto();
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Preto puro: a rubrica é carimbada sobre um PDF de fundo claro, e a cor do
    // tema não se aplica a um traço manuscrito.
    ctx.strokeStyle = "#000000";
  }, [contexto]);

  function posicao(evento: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const caixa = canvas.getBoundingClientRect();
    // Converte do espaço da tela para o do canvas: sem isso o traço escorrega
    // quando o elemento é redimensionado por CSS.
    const escalaX = caixa.width === 0 ? 1 : canvas.width / caixa.width;
    const escalaY = caixa.height === 0 ? 1 : canvas.height / caixa.height;
    return {
      x: (evento.clientX - caixa.left) * escalaX,
      y: (evento.clientY - caixa.top) * escalaY,
    };
  }

  function comecar(evento: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = contexto();
    if (!ctx) return;
    // Captura o ponteiro para o traço não se perder se o dedo sair da área.
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
    desenhandoRef.current = true;
    const { x, y } = posicao(evento);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function mover(evento: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhandoRef.current) return;
    const ctx = contexto();
    if (!ctx) return;
    const { x, y } = posicao(evento);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!temTraco) {
      setTemTraco(true);
      aoDesenhar?.(true);
    }
  }

  function terminar(evento: React.PointerEvent<HTMLCanvasElement>) {
    desenhandoRef.current = false;
    evento.currentTarget.releasePointerCapture?.(evento.pointerId);
  }

  const limpar = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = contexto();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTemTraco(false);
    aoDesenhar?.(false);
  }, [contexto, aoDesenhar]);

  const paraPng = useCallback((): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return Promise.resolve(null);
    return new Promise((resolve) => {
      // PNG porque a API só aceita PNG e porque a transparência preserva o fundo
      // do documento sob a rubrica.
      canvas.toBlob((blob) => {
        resolve(blob);
      }, "image/png");
    });
  }, []);

  useEffect(() => {
    if (!ref) return;
    const handle: CanvasRubricaHandle = {
      estaVazio: () => !temTraco,
      limpar,
      paraPng,
    };
    if (typeof ref === "function") ref(handle);
    else (ref as React.RefObject<CanvasRubricaHandle | null>).current = handle;
  }, [ref, temTraco, limpar, paraPng]);

  return (
    <canvas
      ref={canvasRef}
      width={largura}
      height={altura}
      className="canvas-rubrica"
      // `touch-action: none` impede o navegador de rolar a página enquanto a
      // pessoa desenha com o dedo.
      style={{ touchAction: "none" }}
      role="img"
      aria-label="Área para desenhar sua rubrica"
      onPointerDown={comecar}
      onPointerMove={mover}
      onPointerUp={terminar}
      onPointerCancel={terminar}
      onPointerLeave={terminar}
      data-tem-traco={temTraco ? "sim" : "nao"}
    />
  );
}
