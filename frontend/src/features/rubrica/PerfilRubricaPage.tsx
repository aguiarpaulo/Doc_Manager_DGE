/**
 * Perfil: ver, trocar e apagar a própria rubrica.
 *
 * Fecha a lacuna que a DEM-002 deixou: o direito de exclusão decidido no GAP-004
 * existia na API desde o NODE-026 mas não tinha interface, e portanto só era
 * exercível por chamada direta.
 *
 * Apagar exige senha (GAP-007). O motivo não é o mesmo de assinar — ali a senha
 * torna o ato não-repudiável — e sim que **a exclusão não é reversível**: a
 * imagem some. Uma sessão aberta numa máquina destravada não deve conseguir isso.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Modal } from "../../components/ui/Modal.tsx";
import * as api from "../../data/api.ts";
import { ApplicationError } from "../../data/errors.ts";
import { aguardandoDependencia, useApiData } from "../../data/useApiData.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import { CanvasRubrica, type CanvasRubricaHandle } from "./CanvasRubrica.tsx";
import "./rubrica.css";

interface RubricaBaixada {
  readonly blob: Blob;
  readonly contentType: string;
}

/** Exibe a rubrica a partir do blob, liberando a URL ao desmontar. */
function ImagemRubrica({ blob }: { blob: Blob }) {
  // Derivada com useMemo e revogada no efeito — o padrão que o
  // eslint-plugin-react-hooks exigiu no visualizador de conteúdo.
  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  return <img className="rubrica__imagem" src={url} alt="Sua rubrica registrada" />;
}

export function PerfilRubricaPage() {
  const { temRubrica, recarregarUsuario } = useAuth();

  const buscar = useCallback((): Promise<RubricaBaixada> => {
    // Sem rubrica não há o que baixar, e a tela mostra o convite ao registro.
    if (!temRubrica) return aguardandoDependencia();
    return api.baixarRubrica();
  }, [temRubrica]);
  const rubrica = useApiData<RubricaBaixada>(buscar, [temRubrica]);

  const canvasRef = useRef<CanvasRubricaHandle | null>(null);
  const [trocando, setTrocando] = useState(false);
  const [temTraco, setTemTraco] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [exclusaoAberta, setExclusaoAberta] = useState(false);
  const [senha, setSenha] = useState("");
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);

  const aoDesenhar = useCallback((desenhou: boolean) => {
    setTemTraco(desenhou);
    if (desenhou) setErro(null);
  }, []);

  async function salvar() {
    if (salvando) return;
    if (canvasRef.current?.estaVazio() !== false) {
      setErro("Desenhe a nova rubrica antes de salvar.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const png = await canvasRef.current.paraPng();
      if (png === null) {
        setErro("Não foi possível ler o desenho. Tente novamente.");
        return;
      }
      await api.registrarRubrica(png);
      setTrocando(false);
      setTemTraco(false);
      await recarregarUsuario();
      rubrica.recarregar();
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError
          ? falha.message
          : "Não foi possível salvar a rubrica.",
      );
    } finally {
      setSalvando(false);
    }
  }

  function fecharExclusao() {
    setExclusaoAberta(false);
    // A senha some do estado assim que o diálogo fecha.
    setSenha("");
    setErroExclusao(null);
  }

  async function apagar() {
    if (apagando) return;
    setErroExclusao(null);
    setApagando(true);
    try {
      await api.apagarRubrica(senha);
      fecharExclusao();
      // O guarda de rota decide por `has_signature`: sem reler, a pessoa
      // continuaria navegando como se ainda tivesse rubrica.
      await recarregarUsuario();
    } catch (falha: unknown) {
      setErroExclusao(
        falha instanceof ApplicationError
          ? falha.message
          : "Não foi possível apagar a rubrica.",
      );
    } finally {
      setApagando(false);
    }
  }

  return (
    <main className="rubrica">
      <h1>Minha rubrica</h1>
      <Link to="/">Voltar ao acervo</Link>

      {!temRubrica ? (
        <section aria-labelledby="titulo-sem-rubrica">
          <h2 id="titulo-sem-rubrica">Você ainda não registrou uma rubrica</h2>
          <p>
            Ela é necessária para assinar documentos.{" "}
            <Link to="/rubrica">Registrar agora</Link>.
          </p>
        </section>
      ) : (
        <section aria-labelledby="titulo-atual">
          <h2 id="titulo-atual">Rubrica registrada</h2>

          {rubrica.estado.status === "loading" && (
            <p role="status">Carregando a rubrica...</p>
          )}
          {rubrica.estado.status === "error" && (
            <p role="alert">
              {rubrica.estado.error.message}{" "}
              <button type="button" onClick={rubrica.recarregar}>
                Tentar novamente
              </button>
            </p>
          )}
          {rubrica.estado.status === "success" && (
            <ImagemRubrica blob={rubrica.estado.data.blob} />
          )}

          <div className="rubrica__acoes">
            <button
              type="button"
              onClick={() => {
                setTrocando((valor) => !valor);
              }}
            >
              {trocando ? "Cancelar troca" : "Trocar rubrica"}
            </button>
            <button
              type="button"
              onClick={() => {
                setExclusaoAberta(true);
              }}
            >
              Apagar rubrica
            </button>
          </div>
        </section>
      )}

      {trocando && (
        <section aria-labelledby="titulo-trocar">
          <h2 id="titulo-trocar">Desenhe a nova rubrica</h2>
          <p>A rubrica atual será substituída. Assinaturas já feitas não mudam.</p>

          {erro !== null && <p role="alert">{erro}</p>}

          <CanvasRubrica ref={canvasRef} aoDesenhar={aoDesenhar} />

          <div className="rubrica__acoes">
            <button
              type="button"
              onClick={() => {
                canvasRef.current?.limpar();
              }}
              disabled={salvando}
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando || !temTraco}
            >
              {salvando ? "Salvando..." : "Salvar nova rubrica"}
            </button>
          </div>
        </section>
      )}

      <Modal titulo="Apagar a rubrica" aberto={exclusaoAberta} aoFechar={fecharExclusao}>
        <p>
          A imagem será apagada e não há como recuperá-la. Você precisará registrar
          uma nova rubrica antes de assinar de novo.
        </p>
        <p>
          <strong>As assinaturas que você já fez continuam válidas</strong>, porque
          cada uma guarda a própria cópia do traço no momento em que foi feita.
        </p>

        {erroExclusao !== null && <p role="alert">{erroExclusao}</p>}

        <label htmlFor="senha-exclusao">Confirme sua senha</label>
        <input
          id="senha-exclusao"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
          }}
        />

        <div className="modal__acoes">
          <button type="button" onClick={fecharExclusao} disabled={apagando}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void apagar()}
            disabled={apagando || senha === ""}
          >
            {apagando ? "Apagando..." : "Apagar definitivamente"}
          </button>
        </div>
      </Modal>
    </main>
  );
}
