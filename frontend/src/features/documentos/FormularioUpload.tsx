/**
 * Envio de documento novo.
 *
 * Sao duas chamadas: `POST /documents` cria os metadados (JSON, com `obra_id`
 * como UUID) e `POST /documents/{id}/versions` envia o arquivo como versao 1.
 *
 * A categoria e um `select` com o enum fechado do backend, nao texto livre, e a
 * obra vem da rota — nao ha campo de texto onde a API espera UUID. Foi
 * exatamente esse descasamento que quebrou todo upload na UI anterior
 * (licao do NODE-015).
 */

import { useState, type FormEvent } from "react";

import * as api from "../../data/api.ts";
import {
  CATEGORIAS,
  TAMANHO_MAXIMO,
  TIPOS_ACEITOS,
  type Categoria,
} from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";

export interface FormularioUploadProps {
  readonly obraId: string;
  readonly aoConcluir: () => void;
}

/**
 * Validacao de conveniencia no cliente. O gate real e do servidor, que valida
 * de novo e e quem decide; isto so evita uma ida inutil ate a API.
 *
 * Funcao pura e exportada porque o `accept` do input impede que o proprio
 * navegador (e o userEvent) sequer anexem um tipo recusado, tornando o caminho
 * por interacao impossivel de exercitar.
 */
export function validarArquivo(arquivo: File): string | null {
  if (arquivo.size > TAMANHO_MAXIMO) {
    return "Arquivo maior que o limite de 50 MB.";
  }
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    return `Tipo de arquivo nao aceito: ${arquivo.type || "desconhecido"}.`;
  }
  return null;
}

export function FormularioUpload({ obraId, aoConcluir }: FormularioUploadProps) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("contrato");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando || arquivo === null) return;

    setErro(null);

    const problema = validarArquivo(arquivo);
    if (problema !== null) {
      setErro(problema);
      return;
    }

    setEnviando(true);
    try {
      const documento = await api.criarDocumento({ nome, obraId, categoria });
      await api.enviarVersao(documento.id, arquivo);
      setNome("");
      setArquivo(null);
      aoConcluir();
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError
          ? falha.message
          : "Nao foi possivel enviar o documento.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="formulario-upload"
      onSubmit={(evento) => {
        void aoEnviar(evento);
      }}
      aria-labelledby="titulo-upload"
    >
      <h2 id="titulo-upload">Enviar documento</h2>

      {erro !== null && <p role="alert">{erro}</p>}

      <label htmlFor="campo-nome-documento">Nome</label>
      <input
        id="campo-nome-documento"
        value={nome}
        onChange={(e) => {
          setNome(e.target.value);
        }}
        required
      />

      <label htmlFor="campo-categoria">Categoria</label>
      <select
        id="campo-categoria"
        value={categoria}
        onChange={(e) => {
          setCategoria(e.target.value as Categoria);
        }}
      >
        {CATEGORIAS.map((valor) => (
          <option key={valor} value={valor}>
            {valor}
          </option>
        ))}
      </select>

      <label htmlFor="campo-arquivo">Arquivo</label>
      {/* Sem `required`: o botao ja fica desabilitado sem arquivo e o envio tem
          guarda propria, entao o atributo nao acrescenta garantia — apenas
          impediria o caminho real de interacao de ser testado, porque o jsdom
          nao aceita um `files` definido por script como constraint satisfeita. */}
      <input
        id="campo-arquivo"
        type="file"
        accept={TIPOS_ACEITOS.join(",")}
        onChange={(e) => {
          setArquivo(e.target.files?.[0] ?? null);
        }}
      />

      <button type="submit" disabled={enviando || arquivo === null}>
        {enviando ? "Enviando..." : "Enviar"}
      </button>
    </form>
  );
}
