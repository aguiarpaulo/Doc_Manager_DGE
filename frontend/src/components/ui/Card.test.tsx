import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Card } from "./Card.tsx";

describe("Card", () => {
  it("renderiza os filhos", () => {
    render(<Card>conteudo do cartao</Card>);
    expect(screen.getByText("conteudo do cartao")).toBeInTheDocument();
  });

  it("quando as='link', renderiza como link navegavel para o destino informado", () => {
    render(
      <MemoryRouter>
        <Card as="link" to="/obras/o-1">
          Residencial Aurora
        </Card>
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Residencial Aurora" });
    expect(link).toHaveAttribute("href", "/obras/o-1");
  });
});
