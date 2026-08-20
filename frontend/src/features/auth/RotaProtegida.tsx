/**
 * Guarda de rota.
 *
 * Sem sessao, manda ao login guardando o destino pretendido em `state.de`.
 * Isso e o que permite o link do e-mail de assinatura (fase 2) cair no login e
 * voltar exatamente para a tela do documento depois de autenticar.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext.tsx";

/** Rotas protegidas por sessao, mas nao pela exigencia de rubrica. */
const ROTAS_SEM_RUBRICA = new Set(["/rubrica", "/perfil/rubrica"]);

export function RotaProtegida() {
  const { estado, temRubrica } = useAuth();
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

  const destino = `${location.pathname}${location.search}`;

  // Sem rubrica registrada nao se entra em nenhuma rota protegida: assinar e o
  // proposito do sistema, e o registro e feito pelo proprio punho do titular.
  // A propria tela de registro fica fora deste guarda, senao seria um laco — e a
  // do perfil tambem, senao apagar a rubrica expulsaria a pessoa da tela onde ela
  // acabou de agir, antes de ver o resultado.
  if (!temRubrica && !ROTAS_SEM_RUBRICA.has(location.pathname)) {
    return <Navigate to="/rubrica" replace state={{ de: destino }} />;
  }

  return <Outlet />;
}
