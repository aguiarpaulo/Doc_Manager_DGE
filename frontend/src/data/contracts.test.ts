import { describe, expect, it } from "vitest";

import { parseDocumento, parseObras, parseUsuario } from "./contracts.ts";
import { ApplicationError } from "./errors.ts";

// O ponto destes testes nao e o caminho feliz: e provar que um payload fora do
// contrato falha NA FRONTEIRA, e nao vira `undefined` tres camadas adiante.

describe("parseUsuario", () => {
  const valido = {
    id: "u-1",
    username: "paulo",
    email: "paulo@exemplo.com",
    role: "administrador",
    is_active: true,
  };

  it("aceita um payload dentro do contrato", () => {
    expect(parseUsuario(valido)).toEqual(valido);
  });

  it("rejeita papel fora do conjunto conhecido", () => {
    expect(() => parseUsuario({ ...valido, role: "sindico" })).toThrow(ApplicationError);
  });

  it("rejeita campo obrigatorio ausente", () => {
    const semUsername: Record<string, unknown> = { ...valido };
    delete semUsername["username"];
    expect(() => parseUsuario(semUsername)).toThrow(/username/);
  });

  it("rejeita campo com tipo trocado", () => {
    expect(() => parseUsuario({ ...valido, is_active: "sim" })).toThrow(/is_active/);
  });

  it("rejeita resposta que nao e objeto", () => {
    expect(() => parseUsuario("erro inesperado")).toThrow(ApplicationError);
    expect(() => parseUsuario(null)).toThrow(ApplicationError);
    expect(() => parseUsuario([valido])).toThrow(ApplicationError);
  });
});

describe("parseDocumento", () => {
  const valido = {
    id: "d-1",
    nome: "Contrato",
    obra_id: "o-1",
    categoria: "contrato",
    status: "enviado",
    criado_por: "u-1",
    criado_em: "2026-08-15T12:00:00Z",
    current_version: 1,
  };

  it("aceita o payload que a API realmente devolve", () => {
    expect(parseDocumento(valido).current_version).toBe(1);
  });

  it("rejeita categoria fora do enum Category do backend", () => {
    expect(() => parseDocumento({ ...valido, categoria: "orcamento" })).toThrow(
      /categoria/,
    );
  });

  it("ignora approved_version, que a API nao expoe em DocumentRead", () => {
    const comExtra = { ...valido, approved_version: 3 };
    expect(parseDocumento(comExtra)).not.toHaveProperty("approved_version");
  });

  it("rejeita status fora da maquina de estados", () => {
    expect(() => parseDocumento({ ...valido, status: "assinado" })).toThrow(/status/);
  });

  it("rejeita versao que veio como texto", () => {
    expect(() => parseDocumento({ ...valido, current_version: "1" })).toThrow(
      /current_version/,
    );
  });
});

describe("parseObras", () => {
  it("aceita lista vazia", () => {
    expect(parseObras([])).toEqual([]);
  });

  it("rejeita quando a resposta nao e lista", () => {
    expect(() => parseObras({ id: "o-1" })).toThrow(ApplicationError);
  });

  it("falha se qualquer item da lista estiver fora do contrato", () => {
    const boa = { id: "o-1", nome: "Aurora", descricao: null, is_deleted: false };
    expect(() => parseObras([boa, { id: "o-2" }])).toThrow(/nome/);
  });
});
