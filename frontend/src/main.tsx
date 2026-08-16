import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./styles/index.css";

// Bootstrap minimo: carrega estilos globais, monta a arvore e ativa as
// verificacoes de desenvolvimento. Nenhuma regra de negocio mora aqui.
const container = document.getElementById("root");
if (!container) {
  throw new Error("Elemento #root nao encontrado no documento.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
