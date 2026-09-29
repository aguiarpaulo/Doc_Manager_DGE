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
import "./cabecalho.css";

export function Cabecalho({ children }: { children?: ReactNode }) {
  const { usuario, sair, ehAdministrador } = useAuth();

  return (
    <header className="cabecalho">
      <h1 className="cabecalho__marca">Gerenciador de Documentos</h1>

      {children}

      <span className="cabecalho__identidade">
        {usuario?.username} ({usuario?.role})
      </span>
      <Link to="/perfil/rubrica">Minha rubrica</Link>
      {ehAdministrador && <Link to="/administracao">Administração</Link>}
      <button type="button" onClick={sair}>
        Sair
      </button>
    </header>
  );
}
