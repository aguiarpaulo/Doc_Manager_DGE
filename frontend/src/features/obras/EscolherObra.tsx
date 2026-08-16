/**
 * Entrada da area autenticada.
 *
 * Com obras disponiveis, leva a primeira; sem nenhuma, explica o que fazer em
 * vez de mostrar uma tela vazia sem saida — o caso do sistema recem-instalado.
 */

import { useCallback } from "react";
import { Navigate } from "react-router-dom";

import * as api from "../../data/api.ts";
import type { Obra } from "../../data/contracts.ts";
import { useApiData } from "../../data/useApiData.ts";

export function EscolherObra() {
  const buscar = useCallback((signal: AbortSignal) => api.listarObras(signal), []);
  const { estado, recarregar } = useApiData<Obra[]>(buscar, []);

  if (estado.status === "loading") {
    return <p role="status">Carregando obras...</p>;
  }

  if (estado.status === "error") {
    return (
      <main>
        <h1>GED DGE</h1>
        <p role="alert">{estado.error.message}</p>
        <button type="button" onClick={recarregar}>
          Tentar novamente
        </button>
      </main>
    );
  }

  if (estado.status === "empty") {
    return (
      <main>
        <h1>GED DGE</h1>
        <p>
          Nenhuma obra cadastrada ainda. Um administrador precisa criar a
          primeira obra para que documentos possam ser enviados.
        </p>
      </main>
    );
  }

  const primeira = estado.data[0];
  if (primeira === undefined) {
    return <p role="status">Carregando obras...</p>;
  }

  return <Navigate to={`/obras/${primeira.id}`} replace />;
}
