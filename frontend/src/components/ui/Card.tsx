/**
 * Container compartilhado com o visual "mais amigavel" do redesign: cantos
 * arredondados e sombra suave em vez da borda forte que os controles usam.
 * Um card nao e um "controle" no sentido da WCAG 1.4.11 (campo, select, botao,
 * o modal), entao nao precisa dos 3:1 de --color-border-strong -- a sombra
 * basta como limite visual de um container nao-interativo.
 *
 * `as="link"` e a unica variante interativa que existe hoje: um card que leva
 * a outra rota, como os cartoes de obra do painel inicial.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import "./card.css";

interface CardPropsBase {
  readonly children: ReactNode;
  readonly className?: string;
}

interface CardPropsDiv extends CardPropsBase {
  readonly as?: "div";
}

interface CardPropsLink extends CardPropsBase {
  readonly as: "link";
  readonly to: string;
}

export function Card(props: CardPropsDiv | CardPropsLink) {
  const classes = ["card", props.as === "link" ? "card--link" : "", props.className]
    .filter(Boolean)
    .join(" ");

  if (props.as === "link") {
    return (
      <Link to={props.to} className={classes}>
        {props.children}
      </Link>
    );
  }

  return <div className={classes}>{props.children}</div>;
}
