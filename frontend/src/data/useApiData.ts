/**
 * Integracao reativa com dados remotos.
 *
 * Cuida das tres armadilhas de atualizacao assincrona que a base de
 * conhecimento (secao 7.3) enumera: ignora respostas de requisicoes obsoletas,
 * cancela a requisicao em voo ao desmontar, e nao transforma cancelamento em
 * erro visivel.
 *
 * O estado inicial ja e `loading` porque o hook sempre busca na montagem: nao
 * existe um instante observavel de `idle`, e comecar em `loading` evita
 * transicao de estado sincrona dentro do efeito.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ApplicationError } from "./errors.ts";
import type { RemoteState } from "./remoteState.ts";

export interface UseApiDataResult<T> {
  readonly estado: RemoteState<T>;
  /** Recarrega mantendo os dados atuais na tela durante a revalidacao. */
  readonly recarregar: () => void;
  /**
   * Atualiza localmente quando uma mutacao ja devolveu a entidade atualizada,
   * evitando uma ida extra ao servidor.
   */
  readonly definirDados: (dados: T) => void;
}

/**
 * Sinaliza "ainda nao ha o que buscar" sem inventar um erro.
 *
 * Uma busca que depende de um dado ainda nao carregado (a versao do documento,
 * por exemplo) precisa dizer isso de alguma forma. Rejeitar seria mentir: a tela
 * mostraria uma falha que nao aconteceu, e — pior — competiria com a falha de
 * verdade que chega depois, deixando o alerta visivel a sorte de quem resolve
 * primeiro. Uma promessa que nao se resolve mantem o estado em `loading`, que e
 * literalmente a verdade. O efeito e abortado quando as dependencias mudam.
 */
export function aguardandoDependencia<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/** Considera vazia uma lista sem itens; outros tipos nunca sao "empty". */
function pareceVazio(dados: unknown): boolean {
  return Array.isArray(dados) && dados.length === 0;
}

function estadoParaDados<T>(dados: T): RemoteState<T> {
  return pareceVazio(dados)
    ? { status: "empty" }
    : { status: "success", data: dados, revalidating: false };
}

export function useApiData<T>(
  buscar: (signal: AbortSignal) => Promise<T>,
  dependencias: readonly unknown[] = [],
): UseApiDataResult<T> {
  const [estado, setEstado] = useState<RemoteState<T>>({ status: "loading" });
  const [gatilho, setGatilho] = useState(0);

  // A funcao de busca costuma ser recriada a cada render pelo chamador. Guardar
  // sua identidade num ref mantem o efeito preso apenas a `dependencias`, que e
  // o que de fato define qual recurso esta sendo lido. O ref e atualizado dentro
  // de um efeito, nunca durante o render.
  const buscarRef = useRef(buscar);
  useEffect(() => {
    buscarRef.current = buscar;
  });

  // Identifica a requisicao mais recente: uma resposta antiga que chegue depois
  // de uma nova e descartada em vez de sobrescrever a tela.
  const geracaoRef = useRef(0);

  useEffect(() => {
    const geracao = geracaoRef.current + 1;
    geracaoRef.current = geracao;
    const controller = new AbortController();
    let ativo = true;

    void (async () => {
      try {
        const dados = await buscarRef.current(controller.signal);
        if (!ativo || geracaoRef.current !== geracao) return;
        setEstado(estadoParaDados(dados));
      } catch (erro: unknown) {
        if (!ativo || geracaoRef.current !== geracao) return;
        // Cancelamento e consequencia de navegar ou desmontar, nao falha que o
        // usuario precise ver.
        if (erro instanceof ApplicationError && erro.category === "cancelado") return;
        setEstado({
          status: "error",
          error:
            erro instanceof ApplicationError
              ? erro
              : new ApplicationError("Falha inesperada ao carregar.", "desconhecido"),
        });
      }
    })();

    return () => {
      ativo = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, gatilho]);

  const recarregar = useCallback(() => {
    // Transicao feita no manipulador de evento, nao dentro do efeito: os dados
    // atuais permanecem na tela e apenas o indicador discreto de atualizacao
    // aparece. E isto que separa `revalidating` de `loading`.
    setEstado((anterior) =>
      anterior.status === "success"
        ? { status: "success", data: anterior.data, revalidating: true }
        : anterior,
    );
    setGatilho((valor) => valor + 1);
  }, []);

  const definirDados = useCallback((dados: T) => {
    setEstado(estadoParaDados(dados));
  }, []);

  return { estado, recarregar, definirDados };
}
