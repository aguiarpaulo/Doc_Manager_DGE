// @vitest-environment node

/**
 * Regras administrativas contra a API real.
 *
 * O item 4 do NODE-023 e sobre um 403 que **so o servidor emite**: um
 * administrador nao pode reduzir os proprios privilegios. Testar isso com a
 * fronteira simulada provaria apenas que eu sei escrever um mock; aqui a regra
 * e exercitada onde ela mora, em app/api/users.py.
 *
 * Tambem confirma o corolario documentado no CLAUDE.md: agir sobre *outro*
 * administrador e sempre permitido, porque o autor continua sendo um admin
 * ativo depois da acao. Uma checagem de "ultimo administrador" seria codigo
 * inalcancavel.
 *
 * Roda so com GED_LIVE_API=1.
 */

import { beforeAll, describe, expect, it } from "vitest";

import * as api from "./api.ts";
import type { Usuario } from "./contracts.ts";
import { ApplicationError } from "./errors.ts";
import { configurarTokenProvider } from "./http.ts";

const ativo = process.env["GED_LIVE_API"] === "1";
const USUARIO = process.env["GED_LIVE_USER"] ?? "admin";
const SENHA = process.env["GED_LIVE_PASSWORD"] ?? "";

let accessToken: string | null = null;
let eu: Usuario;
const marca = String(Date.now()).slice(-6);

describe.runIf(ativo)("regras administrativas contra a API real", () => {
  beforeAll(async () => {
    configurarTokenProvider(() => accessToken);
    const tokens = await api.login(USUARIO, SENHA);
    accessToken = tokens.access_token;
    eu = await api.me();
    expect(eu.role).toBe("administrador");
  });

  it("recusa que o administrador desative a si mesmo", async () => {
    const erro = await api
      .atualizarUsuario(eu.id, { is_active: false })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApplicationError);
    expect((erro as ApplicationError).status).toBe(403);
    expect((erro as ApplicationError).category).toBe("autorizacao");
    // A mensagem exibida pela UI vem daqui, nao de texto inventado no cliente.
    expect((erro as ApplicationError).message).toMatch(/proprios privilegios|próprios privilégios/);
  });

  it("recusa que o administrador retire o proprio papel", async () => {
    const erro = await api
      .atualizarUsuario(eu.id, { role: "engenheiro" })
      .catch((e: unknown) => e);

    expect((erro as ApplicationError).status).toBe(403);
  });

  it("continua administrador depois das tentativas recusadas", async () => {
    const atual = await api.me();
    expect(atual.role).toBe("administrador");
    expect(atual.is_active).toBe(true);
  });

  it("permite agir sobre OUTRO administrador", async () => {
    // Corolario documentado: so a auto-acao pode deixar o sistema sem admin.
    const outro = await api.criarUsuario({
      username: `admin2${marca}`,
      email: `admin2${marca}@exemplo.com`,
      password: "senha-de-teste-admin2-123",
      role: "administrador",
    });

    const desativado = await api.atualizarUsuario(outro.id, { is_active: false });
    expect(desativado.is_active).toBe(false);

    const rebaixado = await api.atualizarUsuario(outro.id, { role: "financeiro" });
    expect(rebaixado.role).toBe("financeiro");
  });

  it("recusa usuario duplicado com 409", async () => {
    const erro = await api
      .criarUsuario({
        username: `admin2${marca}`,
        email: `outro${marca}@exemplo.com`,
        password: "senha-de-teste-admin2-123",
        role: "engenheiro",
      })
      .catch((e: unknown) => e);

    expect((erro as ApplicationError).status).toBe(409);
    expect((erro as ApplicationError).category).toBe("conflito");
  });

  it("arquiva e restaura uma obra, que some e volta da listagem ativa", async () => {
    const obra = await api.criarObra(`Obra arquivavel ${marca}`, "teste");

    await api.arquivarObra(obra.id);
    const ativas = await api.listarObras();
    expect(ativas.some((o) => o.id === obra.id)).toBe(false);

    // GET /obras?arquivadas=true existe para a obra arquivada seguir alcancavel.
    const comArquivadas = await api.listarObras(undefined, true);
    expect(comArquivadas.some((o) => o.id === obra.id)).toBe(true);

    const restaurada = await api.restaurarObra(obra.id);
    expect(restaurada.is_deleted).toBe(false);
    const depois = await api.listarObras();
    expect(depois.some((o) => o.id === obra.id)).toBe(true);
  });
});
