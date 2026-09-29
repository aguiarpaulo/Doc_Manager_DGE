/**
 * Renderiza o conteudo de um documento.
 *
 * O despacho e feito **pelo Content-Type que o endpoint de download devolveu**,
 * nunca pela extensao do nome do arquivo. Um arquivo chamado "contrato.pdf" que
 * o servidor entrega como texto e texto; confiar no nome seria confiar em dado
 * fornecido por quem fez o upload.
 *
 * Tipos sem visualizacao propria caem no botao de download por desenho, nao por
 * omissao: so PDF, imagem e texto simples tem previa no navegador.
 *
 * **PDF e desenhado por pdfjs, nao por `<object type="application/pdf">`.** Aquele
 * elemento delega ao visualizador embutido do navegador; onde ele nao existe — e
 * o Chrome pode nao te-lo — o `<object>` cai no conteudo alternativo e o documento
 * simplesmente nao aparece. Foi assim que um PDF valido de 533 KB, servido com o
 * Content-Type certo, virou "Nao foi possivel exibir o PDF neste navegador" na
 * tela de quem usava o sistema. Como o projeto ja embarca pdfjs para a tela de
 * assinatura, havia um renderizador proprio disponivel o tempo todo: usar o
 * plugin era escolher o caminho que depende de terceiros para falhar.
 */

import { useEffect, useMemo, useState } from "react";

import { VisualizadorPdf } from "../assinatura/VisualizadorPdf.tsx";

type Conteudo =
  | { readonly tipo: "pdf"; readonly url: string }
  | { readonly tipo: "imagem"; readonly url: string }
  | { readonly tipo: "texto"; readonly texto: string }
  | { readonly tipo: "download"; readonly url: string; readonly contentType: string };

/** Classifica a partir do Content-Type; a extensao nunca entra na decisao. */
export function classificar(contentType: string, url: string, texto?: string): Conteudo {
  const tipo = contentType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (tipo === "application/pdf") return { tipo: "pdf", url };
  if (tipo.startsWith("image/")) return { tipo: "imagem", url };
  if (tipo === "text/plain") return { tipo: "texto", texto: texto ?? "" };
  return { tipo: "download", url, contentType };
}

export interface VisualizadorConteudoProps {
  readonly nome: string;
  readonly blob: Blob;
  readonly contentType: string;
}

export function VisualizadorConteudo({
  nome,
  blob,
  contentType,
}: VisualizadorConteudoProps) {
  // A URL e derivada do blob, nao guardada em estado: assim nao ha transicao
  // de estado sincrona dentro de efeito, e o efeito abaixo so libera o recurso.
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => {
    return () => {
      // Sem isto o blob fica retido enquanto a aba viver.
      URL.revokeObjectURL(url);
    };
  }, [url]);

  const ehTexto = contentType.split(";")[0]?.trim().toLowerCase() === "text/plain";
  const [texto, setTexto] = useState<string | null>(null);

  useEffect(() => {
    if (!ehTexto) return;
    let ativo = true;
    void blob.text().then((conteudo) => {
      if (ativo) setTexto(conteudo);
    });
    return () => {
      ativo = false;
    };
  }, [blob, ehTexto]);

  if (ehTexto && texto === null) {
    return <p role="status">Preparando visualizacao...</p>;
  }

  const conteudo = classificar(contentType, url, texto ?? "");

  switch (conteudo.tipo) {
    case "pdf":
      // O mesmo renderizador da tela de assinatura, em modo leitura. Ver a nota
      // no topo sobre por que nao e mais um `<object>`.
      return <VisualizadorPdf arquivo={blob} areaAtual={null} somenteLeitura />;

    case "imagem":
      return (
        <img className="visualizador__imagem" src={conteudo.url} alt={`Documento ${nome}`} />
      );

    case "texto":
      return <pre className="visualizador__texto">{conteudo.texto}</pre>;

    case "download":
      return (
        <div className="visualizador__sem-previa">
          <p>
            Este tipo de arquivo ({conteudo.contentType}) nao tem visualizacao no
            navegador.
          </p>
          <a href={conteudo.url} download={nome}>
            Baixar {nome}
          </a>
        </div>
      );
  }
}
