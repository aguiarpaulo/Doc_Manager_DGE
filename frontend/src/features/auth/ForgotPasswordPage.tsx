import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import * as api from "../../data/api.ts";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      await api.forgotPassword(email);
    } catch {
      // Silencioso de proposito: a API responde igual para e-mail existente ou
      // nao, e a UI nao pode desfazer isso revelando a diferenca.
    } finally {
      setEnviando(false);
      setConcluido(true);
    }
  }

  if (concluido) {
    return (
      <main>
        <h1>Recuperar senha</h1>
        <p role="status">
          Se houver conta com esse e-mail, enviamos as instrucoes de
          redefinicao. Verifique sua caixa de entrada.
        </p>
        <Link to="/entrar">Voltar para entrar</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Recuperar senha</h1>
      <form
        onSubmit={(evento) => {
          void aoEnviar(evento);
        }}
      >
        <label htmlFor="campo-email">E-mail</label>
        <input
          id="campo-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          required
        />
        <button type="submit" disabled={enviando}>
          {enviando ? "Enviando..." : "Enviar instrucoes"}
        </button>
      </form>
      <Link to="/entrar">Voltar para entrar</Link>
    </main>
  );
}
