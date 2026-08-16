/**
 * Guarda de rota.
 *
 * Sem sessao, manda ao login guardando o destino pretendido em `state.de`.
 * Isso e o que permite o link do e-mail de assinatura (fase 2) cair no login e
 * voltar exatamente para a tela do documento depois de autenticar.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext.tsx";

export function RotaProtegida() {
  const { estado } = useAuth();
  const location = useLocation();

  if (estado === "verificando") {
    // Enquanto a sessao e reconstruida nao se decide nada: redirecionar aqui
    // expulsaria o usuario a cada F5.
    return (
      <p role="status" aria-live="polite">
        Verificando sessao...
      </p>
    );
  }

  if (estado === "anonimo") {
    const destino = `${location.pathname}${location.search}`;
    return <Navigate to="/entrar" replace state={{ de: destino }} />;
  }

  return <Outlet />;
}
