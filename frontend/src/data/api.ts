/**
 * Funcoes de dominio tipadas, a camada que as paginas realmente consomem.
 *
 * Nenhuma delas monta URL, anexa token ou interpreta status: isso vive em
 * `http.ts`. Aqui so existe "o que a API oferece", em termos do dominio.
 */

import {
  parseAssinatura,
  parseAssinaturas,
  parseDocumento,
  parseDocumentos,
  parseEtapas,
  parseObra,
  parseObras,
  parsePendencias,
  parseRubrica,
  parseSolicitacao,
  parseSolicitacoes,
  parseTokens,
  parseUsuario,
  parseUsuarios,
  parseVersaoDocumento,
  type AssinaturaAplicada,
  type Categoria,
  type Documento,
  type Etapa,
  type Obra,
  type PendenciaAssinatura,
  type Rubrica,
  type SolicitacaoAssinatura,
  type Tokens,
  type Usuario,
  type VersaoDocumento,
} from "./contracts.ts";
import { request, requestBlob, segmento, semConteudo } from "./http.ts";

// --- autenticacao ------------------------------------------------------------

export function login(
  username: string,
  password: string,
  mfaCode?: string,
): Promise<Tokens> {
  const body: Record<string, string> = { username, password };
  if (mfaCode !== undefined && mfaCode !== "") body["mfa_code"] = mfaCode;
  return request("/auth/login", parseTokens, { method: "POST", body });
}

export function me(signal?: AbortSignal): Promise<Usuario> {
  return request("/auth/me", parseUsuario, signal ? { signal } : {});
}

export function refresh(refreshToken: string): Promise<{ access_token: string }> {
  return request(
    "/auth/refresh",
    (bruto: unknown): { access_token: string } => {
      if (
        typeof bruto !== "object" ||
        bruto === null ||
        typeof (bruto as { access_token?: unknown }).access_token !== "string"
      ) {
        throw new Error("Resposta de refresh fora do contrato.");
      }
      return { access_token: (bruto as { access_token: string }).access_token };
    },
    { method: "POST", body: { refresh_token: refreshToken } },
  );
}

export function forgotPassword(email: string): Promise<void> {
  return request("/auth/forgot-password", semConteudo, {
    method: "POST",
    body: { email },
  });
}

export function resetPassword(token: string, novaSenha: string): Promise<void> {
  return request("/auth/reset-password", semConteudo, {
    method: "POST",
    body: { token, new_password: novaSenha },
  });
}

// --- obras -------------------------------------------------------------------

export function listarObras(signal?: AbortSignal, arquivadas = false): Promise<Obra[]> {
  const caminho = arquivadas ? "/obras?arquivadas=true" : "/obras";
  return request(caminho, parseObras, signal ? { signal } : {});
}

export function criarObra(nome: string, descricao: string): Promise<Obra> {
  return request("/obras", parseObra, { method: "POST", body: { nome, descricao } });
}

export function arquivarObra(obraId: string): Promise<void> {
  return request(`/obras/${segmento(obraId)}`, semConteudo, { method: "DELETE" });
}

export function restaurarObra(obraId: string): Promise<Obra> {
  return request(`/obras/${segmento(obraId)}/restore`, parseObra, { method: "POST" });
}

export function atribuirUsuarioAObra(obraId: string, userId: string): Promise<void> {
  return request(
    `/obras/${segmento(obraId)}/users/${segmento(userId)}`,
    semConteudo,
    { method: "PUT" },
  );
}

export function removerUsuarioDaObra(obraId: string, userId: string): Promise<void> {
  return request(
    `/obras/${segmento(obraId)}/users/${segmento(userId)}`,
    semConteudo,
    { method: "DELETE" },
  );
}

// --- usuarios ----------------------------------------------------------------

export function listarUsuarios(signal?: AbortSignal): Promise<Usuario[]> {
  return request("/users", parseUsuarios, signal ? { signal } : {});
}

export function criarUsuario(dados: {
  username: string;
  email: string;
  password: string;
  role: string;
}): Promise<Usuario> {
  return request("/users", parseUsuario, { method: "POST", body: dados });
}

export function atualizarUsuario(
  userId: string,
  mudancas: { role?: string; is_active?: boolean },
): Promise<Usuario> {
  return request(`/users/${segmento(userId)}`, parseUsuario, {
    method: "PATCH",
    body: mudancas,
  });
}

// --- documentos --------------------------------------------------------------

export function listarDocumentos(
  obraId: string,
  signal?: AbortSignal,
): Promise<Documento[]> {
  return request(
    `/documents?obra_id=${segmento(obraId)}`,
    parseDocumentos,
    signal ? { signal } : {},
  );
}

export function obterDocumento(
  documentoId: string,
  signal?: AbortSignal,
): Promise<Documento> {
  return request(
    `/documents/${segmento(documentoId)}`,
    parseDocumento,
    signal ? { signal } : {},
  );
}

/**
 * Criar documento e **duas** chamadas, nao uma: primeiro os metadados em JSON,
 * depois o arquivo como versao 1. A API foi desenhada assim porque um documento
 * existe independentemente de suas versoes.
 *
 * `obra_id` viaja como UUID em JSON — nao como campo de formulario. Foi
 * exatamente aqui que a UI anterior errou (licao do NODE-015): um campo de texto
 * onde a API valida `uuid.UUID` fazia todo upload retornar 422.
 */
export function criarDocumento(dados: {
  nome: string;
  obraId: string;
  categoria: Categoria;
}): Promise<Documento> {
  return request("/documents", parseDocumento, {
    method: "POST",
    body: { nome: dados.nome, obra_id: dados.obraId, categoria: dados.categoria },
  });
}

/**
 * Envia uma versao. O corpo vai como FormData e o navegador define o boundary;
 * por isso a fronteira nao define Content-Type nesse caso.
 *
 * Devolve `DocumentVersionRead` — nao o documento.
 */
export function enviarVersao(
  documentoId: string,
  arquivo: File,
): Promise<VersaoDocumento> {
  const formData = new FormData();
  formData.append("file", arquivo);
  return request(
    `/documents/${segmento(documentoId)}/versions`,
    parseVersaoDocumento,
    { method: "POST", formData },
  );
}

export function baixarVersao(
  documentoId: string,
  versao: number,
): Promise<{ blob: Blob; contentType: string }> {
  return requestBlob(
    `/documents/${segmento(documentoId)}/versions/${segmento(String(versao))}/download`,
  );
}

export function iniciarAnalise(documentoId: string): Promise<Documento> {
  return request(`/documents/${segmento(documentoId)}/review`, parseDocumento, {
    method: "POST",
  });
}

export function aprovarDocumento(documentoId: string): Promise<Documento> {
  return request(`/documents/${segmento(documentoId)}/approve`, parseDocumento, {
    method: "POST",
  });
}

export function rejeitarDocumento(documentoId: string): Promise<Documento> {
  return request(`/documents/${segmento(documentoId)}/reject`, parseDocumento, {
    method: "POST",
  });
}

export function historicoDocumento(
  documentoId: string,
  signal?: AbortSignal,
): Promise<Etapa[]> {
  return request(
    `/documents/${segmento(documentoId)}/history`,
    parseEtapas,
    signal ? { signal } : {},
  );
}

// --- rubrica -----------------------------------------------------------------

/**
 * Registra ou substitui a rubrica do proprio usuario.
 *
 * Nenhuma destas funcoes recebe um id de usuario: a API expoe apenas /me/signature,
 * e ler ou gravar a rubrica de outra pessoa nao e proibido por uma checagem — e
 * inexprimivel, porque nao existe caminho que descreva isso.
 */
export function registrarRubrica(png: Blob): Promise<Rubrica> {
  const formData = new FormData();
  formData.append("file", png, "rubrica.png");
  return request("/me/signature", parseRubrica, { method: "PUT", formData });
}

export function baixarRubrica(): Promise<{ blob: Blob; contentType: string }> {
  return requestBlob("/me/signature");
}

export function apagarRubrica(): Promise<void> {
  return request("/me/signature", semConteudo, { method: "DELETE" });
}

// --- assinatura ---------------------------------------------------------------

/**
 * Marca a area onde alguem deve assinar.
 *
 * As coordenadas viajam como fracoes de 0 a 1 com origem no canto SUPERIOR
 * esquerdo, exatamente como foram desenhadas. A inversao para o sistema do PDF
 * acontece uma unica vez, no servidor, na hora do carimbo.
 */
export function solicitarAssinatura(
  documentoId: string,
  dados: {
    signatarioId: string;
    pagina: number;
    x: number;
    y: number;
    largura: number;
    altura: number;
    pageWidth: number;
    pageHeight: number;
  },
): Promise<SolicitacaoAssinatura> {
  return request(
    `/documents/${segmento(documentoId)}/signature-requests`,
    parseSolicitacao,
    {
      method: "POST",
      body: {
        signatario_id: dados.signatarioId,
        pagina: dados.pagina,
        x: dados.x,
        y: dados.y,
        largura: dados.largura,
        altura: dados.altura,
        page_width: dados.pageWidth,
        page_height: dados.pageHeight,
      },
    },
  );
}

export function listarSolicitacoes(
  documentoId: string,
  signal?: AbortSignal,
): Promise<SolicitacaoAssinatura[]> {
  return request(
    `/documents/${segmento(documentoId)}/signature-requests`,
    parseSolicitacoes,
    signal ? { signal } : {},
  );
}

/**
 * Quem pode assinar um documento desta obra.
 *
 * Existe porque `GET /users` e admin-only: o autor de um documento pode ser um
 * engenheiro, e ele precisa escolher a quem pedir assinatura.
 */
export function listarMembrosDaObra(
  obraId: string,
  signal?: AbortSignal,
): Promise<Usuario[]> {
  return request(
    `/obras/${segmento(obraId)}/users`,
    parseUsuarios,
    signal ? { signal } : {},
  );
}

/**
 * Assina, confirmando com a propria senha.
 *
 * A senha vai no corpo e nao e guardada em lugar nenhum do cliente: nem em
 * estado persistido, nem em log. O que a torna nao-repudiavel e justamente ela
 * ser digitada no ato.
 */
export function assinarSolicitacao(
  documentoId: string,
  solicitacaoId: string,
  password: string,
): Promise<AssinaturaAplicada> {
  return request(
    `/documents/${segmento(documentoId)}/signature-requests/${segmento(solicitacaoId)}/sign`,
    parseAssinatura,
    { method: "POST", body: { password } },
  );
}

export function recusarSolicitacao(
  documentoId: string,
  solicitacaoId: string,
  motivo: string,
): Promise<SolicitacaoAssinatura> {
  return request(
    `/documents/${segmento(documentoId)}/signature-requests/${segmento(solicitacaoId)}/decline`,
    parseSolicitacao,
    { method: "POST", body: { motivo } },
  );
}

export function listarAssinaturas(
  documentoId: string,
  signal?: AbortSignal,
): Promise<AssinaturaAplicada[]> {
  return request(
    `/documents/${segmento(documentoId)}/signatures`,
    parseAssinaturas,
    signal ? { signal } : {},
  );
}

/**
 * O que espera a assinatura de quem chama.
 *
 * O caminho nao recebe id de usuario: ler a fila de outra pessoa nao e proibido
 * por uma checagem, e inexprimivel.
 */
export function minhasPendencias(signal?: AbortSignal): Promise<PendenciaAssinatura[]> {
  return request("/me/signature-requests", parsePendencias, signal ? { signal } : {});
}
