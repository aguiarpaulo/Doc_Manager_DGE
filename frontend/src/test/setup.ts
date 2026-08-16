import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Cada teste comeca com a arvore limpa; estado vazado entre casos e a fonte
// mais comum de teste que passa sozinho e falha na suite.
afterEach(() => {
  cleanup();
});
