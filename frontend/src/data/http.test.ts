import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "./errors.ts";
import {
  configurarTokenProvider,
  request,
  requestBlob,
  resolverUrl,
  semConteudo,
} from "./http.ts";

/** Resposta sintetica; evita depender da forma interna do polyfill. */
function resposta(
  corpo: string | null,
  init: { status?: number; contentType?: string } = {},
): Response {
  const headers = new Headers();
  if (init.contentType !== undefined) headers.set("content-type", init.contentType);
  return new Response(corpo, { status: init.status ?? 200, headers });
}

const identidade = (bruto: unknown): unknown => bruto;

beforeEach(() => {
  configurarTokenProvider(() => null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolverUrl", () => {
  it("prefixa a base configurada sem duplicar barras", () => {
    expect(resolverUrl("/obras")).toBe("/api/obras");
    expect(resolverUrl("obras")).toBe("/api/obras");
  });
});

describe("request — transporte unico", () => {
  it("anexa o token da sessao quando existe", async () => {
    const espiao = vi.fn().mockResolvedValue(resposta("{}", { contentType: "application/json" }));
    vi.stubGlobal("fetch", espiao);
    configurarTokenProvider(() => "token-abc");

    await request("/auth/me", identidade);

    const init = espiao.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer token-abc");
  });

  it("nao anexa Authorization quando nao ha sessao", async () => {
    const espiao = vi.fn().mockResolvedValue(resposta("{}", { contentType: "application/json" }));
    vi.stubGlobal("fetch", espiao);

    await request("/auth/login", identidade, { method: "POST", body: { a: 1 } });

    const init = espiao.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Headers).has("Authorization")).toBe(false);
  });

  it("define Content-Type apenas quando ha corpo JSON", async () => {
    const espiao = vi.fn().mockResolvedValue(resposta("{}", { contentType: "application/json" }));
    vi.stubGlobal("fetch", espiao);

    await request("/x", identidade, { method: "POST", body: { a: 1 } });
    const comJson = espiao.mock.calls[0]?.[1] as RequestInit;
    expect((comJson.headers as Headers).get("Content-Type")).toBe("application/json");

    espiao.mockClear();
    // Em upload o navegador precisa definir o proprio boundary.
    await request("/x", identidade, { method: "POST", formData: new FormData() });
    const comFormData = espiao.mock.calls[0]?.[1] as RequestInit;
    expect((comFormData.headers as Headers).has("Content-Type")).toBe(false);
  });

  it("repassa o AbortSignal para o transporte", async () => {
    const espiao = vi.fn().mockResolvedValue(resposta("{}", { contentType: "application/json" }));
    vi.stubGlobal("fetch", espiao);
    const controller = new AbortController();

    await request("/x", identidade, { signal: controller.signal });

    const init = espiao.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });
});

describe("request — respostas sem corpo JSON", () => {
  it("trata 204 sem tentar interpretar corpo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta(null, { status: 204 })));

    await expect(request("/x", semConteudo, { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("nao presume JSON quando o Content-Type e texto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(resposta("relatorio em texto", { contentType: "text/plain" })),
    );

    await expect(request("/x", identidade)).resolves.toBe("relatorio em texto");
  });

  it("nao quebra quando o corpo se diz JSON mas esta malformado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(resposta("{ nao e json", { contentType: "application/json" })),
    );

    await expect(request("/x", identidade)).resolves.toBeNull();
  });
});

describe("request — taxonomia de erros", () => {
  const casos: ReadonlyArray<readonly [number, string]> = [
    [401, "autenticacao"],
    [403, "autorizacao"],
    [404, "nao-encontrado"],
    [409, "conflito"],
    [422, "validacao"],
    [500, "indisponivel"],
    [503, "indisponivel"],
  ];

  it.each(casos)("HTTP %i vira categoria %s", async (status, categoria) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        resposta(JSON.stringify({ detail: "mensagem da api" }), {
          status,
          contentType: "application/json",
        }),
      ),
    );

    await expect(request("/x", identidade)).rejects.toMatchObject({
      category: categoria,
      status,
      message: "mensagem da api",
    });
  });

  it("distingue falha de rede de resposta malsucedida", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("conexao recusada")));

    const erro = await request("/x", identidade).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ApplicationError);
    expect((erro as ApplicationError).category).toBe("rede");
    expect((erro as ApplicationError).status).toBeNull();
  });

  it("distingue cancelamento de falha de rede", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("abortado", "AbortError")),
    );

    await expect(request("/x", identidade)).rejects.toMatchObject({
      category: "cancelado",
    });
  });

  it("achata o detail por campo de uma resposta 422", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        resposta(
          JSON.stringify({
            detail: [
              { loc: ["body", "obra_id"], msg: "valor nao e um UUID valido" },
              { loc: ["body", "nome"], msg: "campo obrigatorio" },
            ],
          }),
          { status: 422, contentType: "application/json" },
        ),
      ),
    );

    const erro = (await request("/x", identidade).catch((e: unknown) => e)) as ApplicationError;
    expect(erro.category).toBe("validacao");
    expect(erro.message).toBe(
      "obra_id: valor nao e um UUID valido; nome: campo obrigatorio",
    );
    expect(erro.fieldErrors).toEqual([
      { campo: "obra_id", mensagem: "valor nao e um UUID valido" },
      { campo: "nome", mensagem: "campo obrigatorio" },
    ]);
  });

  it("usa mensagem generica quando o erro nao traz corpo interpretavel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta("", { status: 500 })));

    await expect(request("/x", identidade)).rejects.toMatchObject({
      category: "indisponivel",
      message: "Falha na requisicao (HTTP 500).",
    });
  });
});

describe("requestBlob", () => {
  it("preserva o Content-Type informado pelo servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(resposta("%PDF-1.4", { contentType: "application/pdf" })),
    );

    const { contentType } = await requestBlob("/documents/1/versions/1/download");
    expect(contentType).toBe("application/pdf");
  });

  it("cai para octet-stream quando o servidor nao informa o tipo", async () => {
    // Resposta sem corpo nao ganha content-type automatico do polyfill, que e
    // o unico jeito de exercitar de verdade o ramo de fallback.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const { contentType } = await requestBlob("/x");
    expect(contentType).toBe("application/octet-stream");
  });
});
