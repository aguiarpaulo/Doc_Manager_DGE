/**
 * Provedor de autenticacao.
 *
 * Expoe o usuario corrente e as acoes de sessao. O papel do usuario vem sempre
 * de `GET /auth/me` e nunca do payload do JWT: o token carrega apenas
 * `sub`/`type`/`iat`/`exp`, entao qualquer decisao de autorizacao tomada a
 * partir dele seria adivinhacao.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as api from "../../data/api.ts";
import { ApplicationError } from "../../data/errors.ts";
import { configurarTokenProvider } from "../../data/http.ts";
import type { Usuario } from "../../data/contracts.ts";
import {
  definirAccessToken,
  definirRefreshToken,
  lerAccessToken,
  lerRefreshToken,
  limparSessao,
} from "./session.ts";

// A fronteira de dados le o token daqui; assim nenhuma chamada precisa
// receber a credencial como parametro.
configurarTokenProvider(lerAccessToken);

export type EstadoSessao = "verificando" | "autenticado" | "anonimo";

export interface AuthContextValue {
  readonly estado: EstadoSessao;
  readonly usuario: Usuario | null;
  readonly entrar: (
    username: string,
    password: string,
    mfaCode?: string,
  ) => Promise<void>;
  readonly sair: () => void;
  readonly ehAdministrador: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSessao>("verificando");
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  // Na montagem, tenta reconstruir a sessao a partir do refresh token guardado.
  // Isso e o que faz um F5 na mesma aba nao derrubar o usuario.
  useEffect(() => {
    const controller = new AbortController();
    let ativo = true;

    void (async () => {
      const refreshToken = lerRefreshToken();
      if (refreshToken === null) {
        if (ativo) setEstado("anonimo");
        return;
      }
      try {
        const { access_token } = await api.refresh(refreshToken);
        definirAccessToken(access_token);
        const atual = await api.me(controller.signal);
        if (!ativo) return;
        setUsuario(atual);
        setEstado("autenticado");
      } catch {
        // Refresh invalido ou expirado: sessao anonima, sem alarde.
        limparSessao();
        if (ativo) {
          setUsuario(null);
          setEstado("anonimo");
        }
      }
    })();

    return () => {
      ativo = false;
      controller.abort();
    };
  }, []);

  const entrar = useCallback(
    async (username: string, password: string, mfaCode?: string) => {
      const tokens = await api.login(username, password, mfaCode);
      definirAccessToken(tokens.access_token);
      definirRefreshToken(tokens.refresh_token);
      try {
        const atual = await api.me();
        setUsuario(atual);
        setEstado("autenticado");
      } catch (erro: unknown) {
        // Token aceito mas identidade nao pode ser lida: nao deixa a sessao
        // pela metade.
        limparSessao();
        setUsuario(null);
        setEstado("anonimo");
        throw erro instanceof ApplicationError
          ? erro
          : new ApplicationError("Nao foi possivel carregar seu perfil.", "desconhecido");
      }
    },
    [],
  );

  const sair = useCallback(() => {
    limparSessao();
    setUsuario(null);
    setEstado("anonimo");
  }, []);

  const valor = useMemo<AuthContextValue>(
    () => ({
      estado,
      usuario,
      entrar,
      sair,
      ehAdministrador: usuario?.role === "administrador",
    }),
    [estado, usuario, entrar, sair],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const valor = useContext(AuthContext);
  if (valor === null) {
    // Falha imediata e com mensagem clara, como manda a secao 6.2.
    throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  }
  return valor;
}
