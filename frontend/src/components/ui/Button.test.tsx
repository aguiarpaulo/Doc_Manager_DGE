import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button.tsx";

describe("Button", () => {
  it("chama onClick ao ser clicado", async () => {
    const user = userEvent.setup();
    const aoClicar = vi.fn();
    render(<Button onClick={aoClicar}>Enviar</Button>);

    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("nao chama onClick quando desabilitado", async () => {
    const user = userEvent.setup();
    const aoClicar = vi.fn();
    render(
      <Button onClick={aoClicar} disabled>
        Enviar
      </Button>,
    );

    const botao = screen.getByRole("button", { name: "Enviar" });
    expect(botao).toBeDisabled();
    await user.click(botao);

    expect(aoClicar).not.toHaveBeenCalled();
  });

  it("aplica o atributo type informado", () => {
    render(<Button type="submit">Confirmar</Button>);
    expect(screen.getByRole("button", { name: "Confirmar" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("por padrao e do tipo 'button', nunca 'submit' por acidente", () => {
    // O padrao nativo do <button> e "submit" — sem sobrescrever, um Button
    // largado dentro de um <form> sem type explicito submeteria o formulario.
    render(<Button>Enviar</Button>);
    expect(screen.getByRole("button", { name: "Enviar" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("usa a variante primaria por padrao", () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole("button", { name: "Ok" })).toHaveClass("btn--primary");
  });

  it("usa a variante secundaria quando pedido", () => {
    render(<Button variant="secondary">Cancelar</Button>);
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveClass(
      "btn--secondary",
    );
  });
});
