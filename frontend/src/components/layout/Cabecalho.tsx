/**
 * Cabecalho compartilhado entre o painel inicial e o shell de uma obra.
 *
 * Extraido do shell (NODE dashboard) para que "Gerenciador de Documentos" e os
 * links de navegacao existam em um unico lugar, em vez de duplicados em cada
 * tela que precisa deles. `children` e onde o shell de uma obra encaixa o
 * seletor de obra — o painel inicial nao passa nada ali.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../features/auth/AuthContext.tsx";
import { Button } from "../ui/Button.tsx";
import "./cabecalho.css";

export function Cabecalho({ children }: { children?: ReactNode }) {
  const { usuario, sair, ehAdministrador } = useAuth();

  return (
    <header className="cabecalho">
      {/* Titulo de nivel 1 mas tambem navegavel: clicar na marca volta ao
          painel inicial, de qualquer tela que use este cabecalho (o shell da
          obra, por exemplo, nao tinha nenhum outro caminho de volta). */}
      <h1 className="cabecalho__marca">
        <Link to="/">Gerenciador de Documentos</Link>
      </h1>

      {children}

      <span className="cabecalho__identidade">
        {usuario?.username} ({usuario?.role})
      </span>
      <Link to="/perfil/rubrica">Minha rubrica</Link>
      {ehAdministrador && <Link to="/administracao">Administração</Link>}
      <Button variant="secondary" onClick={sair}>
        Sair
      </Button>
    </header>
  );
}
