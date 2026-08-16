// @vitest-environment node

/**
 * Ciclo de vida de documento contra a API real, com MinIO real.
 *
 * Este arquivo existe porque o item 1 do NODE-022 exige que o upload use "os
 * tipos que a API realmente valida". A UI anterior errou exatamente aqui
 * (licao do NODE-015): um campo de texto onde o backend valida `uuid.UUID`
 * fazia todo upload retornar 422, e nenhum teste mockado percebeu, porque os
 * mocks confirmavam a invencao do cliente em vez do contrato do servidor.
 *
 * Nada aqui e simulado: `criarDocumento`, `enviarVersao` e `baixarVersao` sao
 * as funcoes que a tela chama, contra a API de pe.
 *
 * Roda so com GED_LIVE_API=1.
 */

import { beforeAll, describe, expect, it } from "vitest";

import * as api from "./api.ts";
import type { Documento, Obra } from "./contracts.ts";
import { ApplicationError } from "./errors.ts";
import { configurarTokenProvider } from "./http.ts";

const ativo = process.env["GED_LIVE_API"] === "1";
const USUARIO = process.env["GED_LIVE_USER"] ?? "admin";
const SENHA = process.env["GED_LIVE_PASSWORD"] ?? "";

let accessToken: string | null = null;
let obra: Obra;
let documento: Documento;

/** PDF minimo valido, suficiente para o gate de content type do servidor. */
function pdfDeTeste(conteudo: string): File {
  const bytes = new TextEncoder().encode(`%PDF-1.4\n${conteudo}\n%%EOF\n`);
  return new File([bytes], "contrato.pdf", { type: "application/pdf" });
}

describe.runIf(ativo)("ciclo de vida do documento contra a API real", () => {
  beforeAll(async () => {
    configurarTokenProvider(() => accessToken);
    const tokens = await api.login(USUARIO, SENHA);
    accessToken = tokens.access_token;
    obra = await api.criarObra(
      `Obra de teste ${String(Date.now())}`,
      "criada pelo teste de integracao",
    );
  });

  it("cria o documento mandando obra_id como UUID em JSON", async () => {
    documento = await api.criarDocumento({
      nome: "Contrato principal",
      obraId: obra.id,
      categoria: "contrato",
    });

    expect(documento.obra_id).toBe(obra.id);
    expect(documento.categoria).toBe("contrato");
    expect(documento.status).toBe("enviado");
    // Documento existe antes de qualquer versao: sao duas chamadas por desenho.
    expect(documento.current_version).toBe(0);
  });

  it("recusa o formato errado de obra_id, reproduzindo o bug do NODE-015", async () => {
    const erro = await api
      .criarDocumento({
        // O nome da obra onde o backend espera UUID: era este o defeito.
        nome: "X",
        obraId: "Residencial Aurora",
        categoria: "contrato",
      })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApplicationError);
    expect((erro as ApplicationError).status).toBe(422);
    expect((erro as ApplicationError).category).toBe("validacao");
    // A fronteira achata o detail por campo: a UI consegue destacar obra_id.
    expect((erro as ApplicationError).fieldErrors.map((f) => f.campo)).toContain(
      "obra_id",
    );
  });

  it("envia a versao 1 e a armazena de fato no MinIO", async () => {
    const versao = await api.enviarVersao(documento.id, pdfDeTeste("versao um"));

    expect(versao.version).toBe(1);
    expect(versao.document_id).toBe(documento.id);
    expect(versao.tipo).toBe("application/pdf");
    expect(versao.tamanho).toBeGreaterThan(0);
    // SHA-256 em hexadecimal.
    expect(versao.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("baixa o conteudo com o Content-Type que o servidor gravou", async () => {
    const { blob, contentType } = await api.baixarVersao(documento.id, 1);

    // A tela despacha a renderizacao por este valor, nunca pela extensao.
    expect(contentType).toBe("application/pdf");
    expect(await blob.text()).toContain("versao um");
  });

  it("recusa tipo de arquivo fora de ALLOWED_CONTENT_TYPES", async () => {
    const executavel = new File([new Uint8Array([77, 90])], "malware.exe", {
      type: "application/x-msdownload",
    });

    const erro = await api.enviarVersao(documento.id, executavel).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ApplicationError);
    expect((erro as ApplicationError).status).toBeGreaterThanOrEqual(400);
  });

  it("sinaliza duplicata por hash na mesma obra em vez de re-armazenar", async () => {
    const outro = await api.criarDocumento({
      nome: "Copia do contrato",
      obraId: obra.id,
      categoria: "contrato",
    });

    // Byte a byte igual ao que ja existe nesta obra.
    const erro = await api
      .enviarVersao(outro.id, pdfDeTeste("versao um"))
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApplicationError);
    expect((erro as ApplicationError).status).toBe(409);
    expect((erro as ApplicationError).category).toBe("conflito");
  });

  it("volta o status para enviado quando uma nova versao chega", async () => {
    await api.enviarVersao(documento.id, pdfDeTeste("versao dois"));
    const atual = await api.obterDocumento(documento.id);

    expect(atual.current_version).toBe(2);
    expect(atual.status).toBe("enviado");
  });

  it("recusa transicao invalida de status com 409", async () => {
    // As duas regras precisam de atores diferentes para nao se confundirem: a
    // API checa AUTORIZACAO antes da maquina de estados, entao o criador
    // tentando aprovar leva 403 mesmo quando a transicao tambem seria invalida.
    // Quem exercita a transicao e um diretor, que nao criou o documento.
    const marca = String(Date.now()).slice(-6);
    const senha = "senha-de-teste-diretor-123";
    await api.criarUsuario({
      username: `diretor${marca}`,
      email: `diretor${marca}@exemplo.com`,
      password: senha,
      role: "diretor",
    });

    const doAdmin = accessToken;
    const tokensDiretor = await api.login(`diretor${marca}`, senha);
    accessToken = tokensDiretor.access_token;

    // Documento esta em "enviado"; dali so se pode ir para "em_analise".
    const erro = await api.aprovarDocumento(documento.id).catch((e: unknown) => e);
    accessToken = doAdmin;

    expect(erro).toBeInstanceOf(ApplicationError);
    expect((erro as ApplicationError).status).toBe(409);
    expect((erro as ApplicationError).category).toBe("conflito");
  });

  it("impede que o criador decida sobre a propria submissao", async () => {
    const emAnalise = await api.iniciarAnalise(documento.id);
    expect(emAnalise.status).toBe("em_analise");

    // O admin deste teste e quem criou o documento: 403 mesmo sendo admin.
    const erro = await api.aprovarDocumento(documento.id).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApplicationError);
    expect((erro as ApplicationError).status).toBe(403);
    expect((erro as ApplicationError).category).toBe("autorizacao");
  });

  it("lista os documentos da obra pelo endpoint que a tela usa", async () => {
    const documentos = await api.listarDocumentos(obra.id);

    expect(documentos.length).toBeGreaterThanOrEqual(2);
    expect(documentos.every((d) => d.obra_id === obra.id)).toBe(true);
  });

  it("registra as etapas do documento na trilha de auditoria", async () => {
    const etapas = await api.historicoDocumento(documento.id);
    const acoes = etapas.map((e) => e.action);

    expect(acoes).toContain("upload");
    expect(acoes).toContain("download");
  });
});
