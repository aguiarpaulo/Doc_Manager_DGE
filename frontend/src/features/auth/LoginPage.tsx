import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ApplicationError } from "../../data/errors.ts";
import { useAuth } from "./AuthContext.tsx";

interface EstadoDeRota {
  readonly de?: string;
}

export function LoginPage() {
  const { entrar } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [senha, setSenha] = useState("");
  const [mfa, setMfa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const destino = (location.state as EstadoDeRota | null)?.de ?? "/";

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;

    // Erro anterior sai de cena ao iniciar nova tentativa.
    setErro(null);
    setEnviando(true);
    try {
      await entrar(username, senha, mfa === "" ? undefined : mfa);
      navigate(destino, { replace: true });
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError
          ? falha.message
          : "Nao foi possivel entrar. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main>
      <h1>GED DGE</h1>
      <form
        onSubmit={(evento) => {
          void aoEnviar(evento);
        }}
        aria-labelledby="titulo-login"
      >
        <h2 id="titulo-login">Entrar</h2>

        {erro !== null && (
          // Erro importante usa regiao de alerta para ser anunciado.
          <p role="alert">{erro}</p>
        )}

        <label htmlFor="campo-usuario">Usuario</label>
        <input
          id="campo-usuario"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
          }}
          required
        />

        <label htmlFor="campo-senha">Senha</label>
        <input
          id="campo-senha"
          name="password"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
          }}
          required
        />

        <label htmlFor="campo-mfa">Codigo de verificacao (se ativado)</label>
        <input
          id="campo-mfa"
          name="mfa_code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={mfa}
          onChange={(e) => {
            setMfa(e.target.value);
          }}
        />

        {/* Desabilitado durante o envio: impede submissao duplicada. */}
        <button type="submit" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <Link to="/esqueci-minha-senha">Esqueci minha senha</Link>
    </main>
  );
}
