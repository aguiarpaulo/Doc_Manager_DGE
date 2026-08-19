/**
 * Registro da rubrica no primeiro acesso.
 *
 * O aviso de coleta vem **antes** da área de desenho, não depois: é o que a
 * decisão de privacidade do GAP-004 exige, e um aviso que aparece depois do gesto
 * não informou ninguém. Ele diz o que é guardado, para quê, e que a pessoa pode
 * retirar a rubrica depois sem apagar assinaturas já feitas.
 */

import { useCallback, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import * as api from "../../data/api.ts";
import { ApplicationError } from "../../data/errors.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import { CanvasRubrica, type CanvasRubricaHandle } from "./CanvasRubrica.tsx";
import "./rubrica.css";

interface EstadoDeRota {
  readonly de?: string;
}

export function RegistroRubricaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { recarregarUsuario } = useAuth();

  const canvasRef = useRef<CanvasRubricaHandle | null>(null);
  const [temTraco, setTemTraco] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const destino = (location.state as EstadoDeRota | null)?.de ?? "/";

  const aoDesenhar = useCallback((desenhou: boolean) => {
    setTemTraco(desenhou);
    if (desenhou) setErro(null);
  }, []);

  async function salvar() {
    if (enviando) return;
    setErro(null);

    if (canvasRef.current?.estaVazio() !== false) {
      // Um canvas em branco viraria um PNG transparente que a API aceitaria e
      // que carimbaria nada no PDF.
      setErro("Desenhe a sua rubrica antes de salvar.");
      return;
    }

    setEnviando(true);
    try {
      const png = await canvasRef.current.paraPng();
      if (png === null) {
        setErro("Não foi possível ler o desenho. Tente novamente.");
        return;
      }
      await api.registrarRubrica(png);
      // O guarda de rota decide pelo `has_signature` de /auth/me, então a sessão
      // precisa refletir o registro antes de sair desta tela.
      await recarregarUsuario();
      navigate(destino, { replace: true });
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError
          ? falha.message
          : "Não foi possível salvar a rubrica.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="rubrica">
      <h1>Registre a sua rubrica</h1>

      {/* Antes do desenho, por desenho. */}
      <section aria-labelledby="titulo-aviso" className="rubrica__aviso">
        <h2 id="titulo-aviso">O que é guardado e para quê</h2>
        <p>
          A imagem da sua rubrica é um dado pessoal. Ela fica guardada para ser
          aplicada aos documentos que você assinar neste sistema, e não é usada
          para mais nada.
        </p>
        <p>
          Só você pode vê-la ou substituí-la — nem um administrador tem acesso à
          rubrica de outra pessoa. Você pode retirá-la quando quiser, no seu
          perfil; as assinaturas que você já tiver feito continuam válidas, porque
          cada uma guarda a própria cópia do traço no momento em que foi feita.
        </p>
      </section>

      {erro !== null && <p role="alert">{erro}</p>}

      <p id="ajuda-canvas">
        Desenhe com o mouse, o dedo ou uma caneta, como assinaria no papel.
      </p>

      <CanvasRubrica ref={canvasRef} aoDesenhar={aoDesenhar} />

      <div className="rubrica__acoes">
        <button
          type="button"
          onClick={() => {
            canvasRef.current?.limpar();
          }}
          disabled={enviando}
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={enviando || !temTraco}
        >
          {enviando ? "Salvando..." : "Salvar rubrica"}
        </button>
      </div>
    </main>
  );
}
