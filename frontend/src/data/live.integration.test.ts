// @vitest-environment node

/**
 * Teste de integracao contra a API real.
 *
 * Existe por causa da licao do NODE-015 registrada no CLAUDE.md: execucao com a
 * fronteira HTTP simulada nunca exercita os tipos que o backend valida de
 * verdade, e foi assim que um campo de texto para `uuid.UUID` chegou a producao
 * fazendo todo upload retornar 422.
 *
 * Aqui nada e mockado: o transporte real fala com uma API real e os parsers
 * reais validam a resposta real. Um desencontro de contrato falha aqui.
 *
 * Roda apenas quando GED_LIVE_API=1 e VITE_API_BASE_URL apontam para uma API de
 * pe; caso contrario e ignorado, para que a suite normal siga sem servicos.
 */

import { beforeAll, describe, expect, it } from "vitest";

import * as api from "./api.ts";
import { ApplicationError } from "./errors.ts";
import { configurarTokenProvider } from "./http.ts";

const ativo = process.env["GED_LIVE_API"] === "1";
const USUARIO = process.env["GED_LIVE_USER"] ?? "admin";
const SENHA = process.env["GED_LIVE_PASSWORD"] ?? "";

let accessToken: string | null = null;

describe.runIf(ativo)("fronteira de dados contra a API real", () => {
  beforeAll(() => {
    configurarTokenProvider(() => accessToken);
  });

  it("autentica e recebe o par de tokens no formato do contrato", async () => {
    const tokens = await api.login(USUARIO, SENHA);

    // O parser ja teria lancado se o formato divergisse; estas assercoes
    // documentam o que a API de fato devolve.
    expect(typeof tokens.access_token).toBe("string");
    expect(tokens.access_token.length).toBeGreaterThan(20);
    expect(typeof tokens.refresh_token).toBe("string");
    expect(tokens.refresh_token).not.toBe(tokens.access_token);

    accessToken = tokens.access_token;
  });

  it("le o usuario corrente por GET /auth/me com o token obtido", async () => {
    const usuario = await api.me();

    expect(usuario.username).toBe(USUARIO);
    // O papel so existe aqui: o JWT carrega apenas sub/type/iat/exp.
    expect(["administrador", "diretor", "engenheiro", "financeiro"]).toContain(
      usuario.role,
    );
    expect(usuario.is_active).toBe(true);
    expect(usuario.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("renova o access token pelo refresh sem novo login", async () => {
    const tokens = await api.login(USUARIO, SENHA);
    const renovado = await api.refresh(tokens.refresh_token);

    expect(typeof renovado.access_token).toBe("string");

    // O token renovado precisa realmente valer para chamadas seguintes.
    accessToken = renovado.access_token;
    const usuario = await api.me();
    expect(usuario.username).toBe(USUARIO);
  });

  it("classifica senha errada como erro de autenticacao", async () => {
    const erro = await api
      .login(USUARIO, "senha-que-nao-e-a-correta")
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApplicationError);
    expect((erro as ApplicationError).category).toBe("autenticacao");
    expect((erro as ApplicationError).status).toBe(401);
  });

  it("responde 401 tambem para usuario malformado e nao 422", async () => {
    // Regra documentada no CLAUDE.md: LoginRequest.username e `str` puro de
    // proposito, porque um 422 ensinaria a regra de nomes a um chamador anonimo.
    const erro = await api.login("usuario invalido!!", "qualquer").catch((e: unknown) => e);

    expect((erro as ApplicationError).status).toBe(401);
    expect((erro as ApplicationError).category).toBe("autenticacao");
  });

  it("recusa GET /auth/me sem token", async () => {
    const anterior = accessToken;
    accessToken = null;
    const erro = await api.me().catch((e: unknown) => e);
    accessToken = anterior;

    expect(erro).toBeInstanceOf(ApplicationError);
    expect((erro as ApplicationError).category).toBe("autenticacao");
  });

  it("lista obras com o escopo do administrador", async () => {
    const obras = await api.listarObras();
    // Base recem-criada: lista vazia e resposta valida, nao falha.
    expect(Array.isArray(obras)).toBe(true);
  });
});
