/**
 * Renderiza um PDF e deixa marcar a área onde alguém deve assinar.
 *
 * `pdfjs-dist` entra por **import dinâmico**: é a maior dependência do projeto e
 * só faz sentido baixá-la para quem abre um PDF. O Vite a separa num chunk
 * próprio, verificável no relatório de bundle.
 *
 * A área é expressa em **frações da página (0..1) com origem no canto superior
 * esquerdo**, como foi desenhada. Nada aqui inverte o eixo — a conversão para o
 * sistema do PDF acontece uma única vez, no servidor, na hora do carimbo.
 * Guardar pixels de tela seria pior de todas as formas: mudaria com o zoom, com o
 * tamanho da janela e com a densidade do monitor.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface AreaNormalizada {
  readonly pagina: number;
  readonly x: number;
  readonly y: number;
  readonly largura: number;
  readonly altura: number;
  /** Dimensões da página em pontos, como o PDF as declara. */
  readonly pageWidth: number;
  readonly pageHeight: number;
}

export interface VisualizadorPdfProps {
  readonly arquivo: Blob;
  readonly aoMarcar: (area: AreaNormalizada) => void;
  readonly areaAtual: AreaNormalizada | null;
}

interface PaginaRenderizada {
  readonly numero: number;
  readonly larguraPt: number;
  readonly alturaPt: number;
}

type EstadoPdf =
  | { readonly status: "carregando" }
  | { readonly status: "pronto"; readonly paginas: PaginaRenderizada[] }
  | { readonly status: "erro"; readonly mensagem: string };

/** Passo do teclado, em fração da página: 1% por tecla, 10% com Shift. */
const PASSO = 0.01;
const PASSO_GRANDE = 0.1;

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Move ou redimensiona a área sem deixá-la sair da página. Função pura para poder
 * ser conferida contra números, que é o que o teclado exercita.
 */
export function moverArea(
  area: AreaNormalizada,
  acao: { readonly eixo: "x" | "y"; readonly delta: number; readonly redimensiona: boolean },
): AreaNormalizada {
  if (acao.redimensiona) {
    if (acao.eixo === "x") {
      const largura = limitar(area.largura + acao.delta, 0.02, 1 - area.x);
      return { ...area, largura };
    }
    const altura = limitar(area.altura + acao.delta, 0.02, 1 - area.y);
    return { ...area, altura };
  }
  if (acao.eixo === "x") {
    return { ...area, x: limitar(area.x + acao.delta, 0, 1 - area.largura) };
  }
  return { ...area, y: limitar(area.y + acao.delta, 0, 1 - area.altura) };
}

export function VisualizadorPdf({ arquivo, aoMarcar, areaAtual }: VisualizadorPdfProps) {
  const [estado, setEstado] = useState<EstadoPdf>({ status: "carregando" });
  const [paginaAtiva, setPaginaAtiva] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const arrastandoRef = useRef<{ x: number; y: number } | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    // Sem transicao sincrona aqui: o estado inicial ja e "carregando", e a volta
    // para ele quando se tenta de novo acontece no manipulador do botao, que e
    // onde ela e legitima.
    void (async () => {
      try {
        // Import dinâmico: fora do chunk inicial.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const dados = new Uint8Array(await arquivo.arrayBuffer());
        const documento = await pdfjs.getDocument({ data: dados }).promise;

        const paginas: PaginaRenderizada[] = [];
        for (let numero = 1; numero <= documento.numPages; numero += 1) {
          const pagina = await documento.getPage(numero);
          const viewport = pagina.getViewport({ scale: 1 });
          paginas.push({
            numero,
            // Pontos, como o PDF declara — é isso que a API precisa registrar.
            larguraPt: viewport.width,
            alturaPt: viewport.height,
          });

          const canvas = containerRef.current?.querySelector<HTMLCanvasElement>(
            `canvas[data-pagina="${String(numero)}"]`,
          );
          const contexto = canvas?.getContext("2d");
          if (canvas && contexto) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await pagina.render({ canvas, canvasContext: contexto, viewport }).promise;
          }
        }

        if (ativo) setEstado({ status: "pronto", paginas });
      } catch (erro: unknown) {
        if (ativo) {
          setEstado({
            status: "erro",
            mensagem:
              erro instanceof Error
                ? `Não foi possível abrir o PDF: ${erro.message}`
                : "Não foi possível abrir o PDF.",
          });
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, [arquivo, tentativa]);

  const paginaInfo =
    estado.status === "pronto"
      ? estado.paginas.find((p) => p.numero === paginaAtiva)
      : undefined;

  const emitir = useCallback(
    (area: Omit<AreaNormalizada, "pageWidth" | "pageHeight" | "pagina">) => {
      if (!paginaInfo) return;
      aoMarcar({
        pagina: paginaInfo.numero,
        ...area,
        pageWidth: paginaInfo.larguraPt,
        pageHeight: paginaInfo.alturaPt,
      });
    },
    [aoMarcar, paginaInfo],
  );

  function fracoes(evento: React.PointerEvent<HTMLDivElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    // Divide pelo tamanho renderizado: o resultado é o mesmo em qualquer zoom.
    return {
      x: limitar((evento.clientX - caixa.left) / (caixa.width || 1), 0, 1),
      y: limitar((evento.clientY - caixa.top) / (caixa.height || 1), 0, 1),
    };
  }

  function comecar(evento: React.PointerEvent<HTMLDivElement>) {
    arrastandoRef.current = fracoes(evento);
  }

  function soltar(evento: React.PointerEvent<HTMLDivElement>) {
    const inicio = arrastandoRef.current;
    arrastandoRef.current = null;
    if (!inicio) return;
    const fim = fracoes(evento);

    const x = Math.min(inicio.x, fim.x);
    const y = Math.min(inicio.y, fim.y);
    const largura = Math.abs(fim.x - inicio.x);
    const altura = Math.abs(fim.y - inicio.y);
    if (largura < 0.02 || altura < 0.01) return; // clique solto, não é área

    emitir({ x, y, largura, altura });
  }

  function pelasTeclas(evento: React.KeyboardEvent<HTMLDivElement>) {
    if (!areaAtual) return;
    const passo = evento.shiftKey ? PASSO_GRANDE : PASSO;
    const redimensiona = evento.altKey;

    const mapa: Record<string, { eixo: "x" | "y"; delta: number } | undefined> = {
      ArrowLeft: { eixo: "x", delta: -passo },
      ArrowRight: { eixo: "x", delta: passo },
      ArrowUp: { eixo: "y", delta: -passo },
      ArrowDown: { eixo: "y", delta: passo },
    };
    const acao = mapa[evento.key];
    if (!acao) return;

    evento.preventDefault();
    const movida = moverArea(areaAtual, { ...acao, redimensiona });
    aoMarcar(movida);
  }

  if (estado.status === "carregando") {
    return (
      <p role="status" aria-live="polite">
        Carregando o documento...
      </p>
    );
  }

  if (estado.status === "erro") {
    return (
      <div>
        <p role="alert">{estado.mensagem}</p>
        <button
          type="button"
          onClick={() => {
            setEstado({ status: "carregando" });
            setTentativa((t) => t + 1);
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="visualizador-pdf" ref={containerRef}>
      <div className="visualizador-pdf__paginas">
        <label htmlFor="seletor-pagina">Página</label>
        <select
          id="seletor-pagina"
          value={paginaAtiva}
          onChange={(e) => {
            setPaginaAtiva(Number(e.target.value));
          }}
        >
          {estado.paginas.map((p) => (
            <option key={p.numero} value={p.numero}>
              {p.numero}
            </option>
          ))}
        </select>
      </div>

      {estado.paginas.map((p) => (
        <div
          key={p.numero}
          className="visualizador-pdf__pagina"
          hidden={p.numero !== paginaAtiva}
        >
          <canvas data-pagina={p.numero} aria-label={`Página ${String(p.numero)}`} />

          {/* Camada de marcação: recebe o arrasto e o teclado. */}
          <div
            className="visualizador-pdf__marcacao"
            role="application"
            aria-label={`Marcar área de assinatura na página ${String(p.numero)}`}
            aria-describedby="ajuda-marcacao"
            tabIndex={0}
            onPointerDown={comecar}
            onPointerUp={soltar}
            onKeyDown={pelasTeclas}
          >
            {areaAtual && areaAtual.pagina === p.numero && (
              <div
                className="visualizador-pdf__area"
                data-testid="area-marcada"
                style={{
                  left: `${String(areaAtual.x * 100)}%`,
                  top: `${String(areaAtual.y * 100)}%`,
                  width: `${String(areaAtual.largura * 100)}%`,
                  height: `${String(areaAtual.altura * 100)}%`,
                }}
              />
            )}
          </div>
        </div>
      ))}

      <p id="ajuda-marcacao">
        Arraste sobre a página para marcar onde a assinatura deve ficar. Pelo
        teclado: setas movem, Shift acelera e Alt redimensiona.
      </p>
    </div>
  );
}
