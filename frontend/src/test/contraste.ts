/**
 * Razão de contraste WCAG a partir dos tokens.
 *
 * Existe porque o axe **não consegue** verificar contraste sob jsdom: a regra
 * `color-contrast` depende de renderização real e é desativada automaticamente.
 * Rodar o axe e declarar "sem violação de contraste" seria uma afirmação vazia.
 *
 * Em vez disso, os valores são lidos do próprio arquivo de tokens e as razões são
 * calculadas pela fórmula da WCAG 2.1. Isso verifica exatamente o que a §12.4 da
 * base de conhecimento pede: **combinações de token aprovadas**, não cores
 * isoladas.
 */

// Import `?raw` do Vite: resolve pelo grafo de modulos, nao pelo diretorio de
// execucao. Ler do disco com `process.cwd()` quebra quando o vitest e invocado
// de fora de frontend/ — que e como o registrador de evidencia o chama.
import cssTokens from "../styles/index.css?raw";

export type Tokens = Record<string, string>;

/** Lê os tokens de um bloco `:root` do arquivo de estilos. */
export function lerTokens(seletor = ":root {"): Tokens {
  const css = cssTokens;

  const inicio = css.indexOf(seletor);
  if (inicio === -1) throw new Error(`bloco ${seletor} não encontrado`);
  const fim = css.indexOf("}", inicio);
  const bloco = css.slice(inicio, fim);

  const tokens: Tokens = {};
  for (const linha of bloco.split("\n")) {
    const casamento = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i.exec(linha);
    if (casamento?.[1] && casamento[2]) tokens[casamento[1]] = casamento[2].trim();
  }
  return tokens;
}

function canalLinear(valor: number): number {
  const s = valor / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminancia(cor: string): number {
  const hex = cor.trim().replace("#", "");
  const completo =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const r = parseInt(completo.slice(0, 2), 16);
  const g = parseInt(completo.slice(2, 4), 16);
  const b = parseInt(completo.slice(4, 6), 16);
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);
}

/** Razão de contraste WCAG entre duas cores hexadecimais. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}
