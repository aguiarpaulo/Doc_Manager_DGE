import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Cada teste comeca com a arvore limpa; estado vazado entre casos e a fonte
// mais comum de teste que passa sozinho e falha na suite.
afterEach(() => {
  cleanup();
});

/**
 * O jsdom nao implementa <canvas>: `getContext` devolve null e `toBlob` nao
 * existe. Este duplo permite testar a **logica** da tela de rubrica — guarda de
 * rota, deteccao de canvas vazio, fluxo de salvar — sem fingir que o desenho em
 * si foi verificado. O traco de verdade so se comprova em navegador, e isso
 * pertence ao E2E (NODE-040).
 */
const contextoFalso = {
  lineWidth: 0,
  lineCap: "",
  lineJoin: "",
  strokeStyle: "",
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  clearRect: () => {},
};

// Os testes de integracao rodam em ambiente Node, onde nao existe DOM: sem esta
// guarda o setup derrubaria o carregamento deles.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() =>
    contextoFalso) as unknown as HTMLCanvasElement["getContext"];

  HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
    callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
  };
}
