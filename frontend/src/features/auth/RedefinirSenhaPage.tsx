/**
 * Redefinição de senha pelo link do e-mail.
 *
 * Esta tela faltava. `POST /auth/reset-password` existe desde o NODE-012 e
 * `resetPassword` já estava na fronteira de dados, mas nada na SPA os chamava e
 * não havia rota `/redefinir-senha` — que é exatamente o caminho que
 * `get_email_sender` monta e envia. Quem clicava no link do e-mail caía na
 * página "não encontrada", e a recuperação de senha não existia na prática.
 *
 * O token vem na query, não num campo: quem chega já o trouxe no link, e pedir
 * que a pessoa o copie seria transformar um detalhe de transporte em tarefa.
 */

import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "../../components/ui/Button.tsx";
import * as api from "../../data/api.ts";
import { ApplicationError } from "../../data/errors.ts";

export function RedefinirSenhaPage() {
  const [parametros] = useSearchParams();
  const token = parametros.get("token") ?? "";

  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;

    if (senha !== confirmacao) {
      setErro("As senhas não conferem. Digite a mesma senha nos dois campos.");
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      await api.resetPassword(token, senha);
      setConcluido(true);
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError
          ? falha.message
          : "Não foi possível redefinir a senha. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  }

  if (token === "") {
    return (
      <main>
        <h1>Redefinir senha</h1>
        <p role="alert">
          Este link está incompleto ou inválido — falta o código de confirmação.
        </p>
        <Link to="/esqueci-minha-senha">Pedir um novo link</Link>
      </main>
    );
  }

  if (concluido) {
    return (
      <main>
        <h1>Redefinir senha</h1>
        {/* O formulário sai da tela: o token é de uso único e reenviá-lo falharia. */}
        <p role="status">
          Sua senha foi redefinida. Use a senha nova para entrar.
        </p>
        <Link to="/entrar">Entrar</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Redefinir senha</h1>

      {erro !== null && (
        <p role="alert">
          {erro} <Link to="/esqueci-minha-senha">Pedir um novo link</Link>
        </p>
      )}

      <form
        onSubmit={(evento) => {
          void aoEnviar(evento);
        }}
      >
        <label htmlFor="nova-senha-reset">Nova senha</label>
        <input
          id="nova-senha-reset"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
          }}
        />

        <label htmlFor="confirmar-senha-reset">Confirme a nova senha</label>
        <input
          id="confirmar-senha-reset"
          type="password"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => {
            setConfirmacao(e.target.value);
          }}
        />

        <Button type="submit" disabled={enviando || senha === "" || confirmacao === ""}>
          {enviando ? "Redefinindo..." : "Redefinir senha"}
        </Button>
      </form>

      <Link to="/entrar">Voltar para entrar</Link>
    </main>
  );
}
