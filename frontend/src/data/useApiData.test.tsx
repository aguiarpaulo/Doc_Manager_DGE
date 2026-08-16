import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApplicationError } from "./errors.ts";
import { useApiData } from "./useApiData.ts";

/** Sonda: expoe o estado remoto como texto para consulta por papel/nome. */
function Sonda({ buscar }: { buscar: (signal: AbortSignal) => Promise<string[]> }) {
  const { estado, recarregar } = useApiData(buscar);
  return (
    <div>
      <p data-testid="status">{estado.status}</p>
      <p data-testid="revalidando">
        {estado.status === "success" && estado.revalidating ? "sim" : "nao"}
      </p>
      <p data-testid="dados">
        {estado.status === "success" ? estado.data.join(",") : ""}
      </p>
      <p data-testid="erro">{estado.status === "error" ? estado.error.message : ""}</p>
      <button type="button" onClick={recarregar}>
        Recarregar
      </button>
    </div>
  );
}

describe("useApiData", () => {
  it("vai de loading a success quando ha dados", async () => {
    render(<Sonda buscar={() => Promise.resolve(["a", "b"])} />);

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("success");
    });
    expect(screen.getByTestId("dados")).toHaveTextContent("a,b");
  });

  it("distingue resposta valida sem itens de falha", async () => {
    render(<Sonda buscar={() => Promise.resolve([])} />);

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("empty");
    });
    // O ponto do teste: vazio nao e erro.
    expect(screen.getByTestId("erro")).toHaveTextContent("");
  });

  it("expoe o erro da fronteira sem perder a mensagem", async () => {
    render(
      <Sonda
        buscar={() =>
          Promise.reject(new ApplicationError("Sem acesso a esta obra.", "autorizacao"))
        }
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("error");
    });
    expect(screen.getByTestId("erro")).toHaveTextContent("Sem acesso a esta obra.");
  });

  it("marca revalidating e mantem os dados na tela durante a recarga", async () => {
    const usuario = userEvent.setup();
    let liberar: (valor: string[]) => void = () => {};
    let chamada = 0;
    const buscar = () => {
      chamada += 1;
      if (chamada === 1) return Promise.resolve(["inicial"]);
      return new Promise<string[]>((resolve) => {
        liberar = resolve;
      });
    };

    render(<Sonda buscar={buscar} />);
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("success");
    });

    await usuario.click(screen.getByRole("button", { name: "Recarregar" }));

    // Durante a revalidacao os dados anteriores continuam visiveis: e isso que
    // separa "revalidating" de "loading".
    expect(screen.getByTestId("status")).toHaveTextContent("success");
    expect(screen.getByTestId("revalidando")).toHaveTextContent("sim");
    expect(screen.getByTestId("dados")).toHaveTextContent("inicial");

    await act(async () => {
      liberar(["atualizado"]);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("dados")).toHaveTextContent("atualizado");
    });
    expect(screen.getByTestId("revalidando")).toHaveTextContent("nao");
  });

  it("ignora a resposta de uma requisicao obsoleta", async () => {
    const usuario = userEvent.setup();
    let liberarAntiga: (valor: string[]) => void = () => {};
    let chamada = 0;
    const buscar = () => {
      chamada += 1;
      if (chamada === 1) return Promise.resolve(["inicial"]);
      if (chamada === 2) {
        return new Promise<string[]>((resolve) => {
          liberarAntiga = resolve;
        });
      }
      return Promise.resolve(["mais recente"]);
    };

    render(<Sonda buscar={buscar} />);
    await waitFor(() => {
      expect(screen.getByTestId("dados")).toHaveTextContent("inicial");
    });

    await usuario.click(screen.getByRole("button", { name: "Recarregar" }));
    await usuario.click(screen.getByRole("button", { name: "Recarregar" }));

    await waitFor(() => {
      expect(screen.getByTestId("dados")).toHaveTextContent("mais recente");
    });

    // A resposta antiga chega depois da nova e deve ser descartada.
    await act(async () => {
      liberarAntiga(["obsoleta"]);
      await Promise.resolve();
    });

    expect(screen.getByTestId("dados")).toHaveTextContent("mais recente");
  });

  it("nao vira estado de erro quando a requisicao e cancelada", async () => {
    render(
      <Sonda
        buscar={() =>
          Promise.reject(new ApplicationError("Requisicao cancelada.", "cancelado"))
        }
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId("status")).not.toHaveTextContent("error");
  });

  it("cancela a requisicao em voo ao desmontar", async () => {
    const abortados: boolean[] = [];
    const buscar = (signal: AbortSignal) =>
      new Promise<string[]>(() => {
        signal.addEventListener("abort", () => abortados.push(true));
      });

    const { unmount } = render(<Sonda buscar={buscar} />);
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("loading");
    });

    unmount();
    await waitFor(() => {
      expect(abortados).toContain(true);
    });
  });

  it("nao chama a busca mais de uma vez na montagem", async () => {
    const buscar = vi.fn().mockResolvedValue(["a"]);
    render(<Sonda buscar={buscar} />);

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("success");
    });
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});
