/**
 * Botao compartilhado: substitui o `<button>` nu usado em toda a aplicacao por
 * um unico ponto onde o visual "mais amigavel" do redesign (cantos
 * arredondados, acento vivo) vive, em vez de repetido por tela.
 *
 * `primary` (preenchido) nao leva borda propria: o preenchimento contra a
 * superficie da pagina ja atende os 3:1 da WCAG 1.4.11 sozinho. `secondary`
 * nao e preenchido, entao mantem a borda --color-border-strong que todo outro
 * controle desta aplicacao usa para se identificar.
 */

import type { ButtonHTMLAttributes } from "react";

import "./button.css";

type Variante = "primary" | "secondary";

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variante }) {
  const classes = ["btn", `btn--${variant}`, className].filter(Boolean).join(" ");
  return <button type={type} className={classes} {...props} />;
}
