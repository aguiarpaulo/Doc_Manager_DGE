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
 */

import { useEffect, useMemo, useState } from "react";

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
      return (
        <object
          className="visualizador__quadro"
          data={conteudo.url}
          type="application/pdf"
          aria-label={`Documento ${nome}`}
        >
          {/* Navegador sem visualizador embutido ainda precisa de saida. */}
          <p>
            Nao foi possivel exibir o PDF neste navegador.{" "}
            <a href={conteudo.url} download={nome}>
              Baixar {nome}
            </a>
          </p>
        </object>
      );

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
