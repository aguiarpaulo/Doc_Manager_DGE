/**
 * Area de administracao: usuarios e obras.
 *
 * Duas regras de estrutura vieram da UI anterior e continuam valendo:
 *
 * 1. **Os blocos nao dependem de existir obra.** Criar a primeira obra e feito
 *    aqui, entao um retorno antecipado por "nenhuma obra" travaria uma
 *    instalacao nova. Restaurar obra arquivada tem o mesmo problema: se a unica
 *    obra do sistema foi arquivada, esta tela precisa continuar alcancavel.
 * 2. **O papel vem de `GET /auth/me`**, nunca do JWT, que carrega so
 *    sub/type/iat/exp.
 *
 * As regras de autorizacao sao do servidor. Em especial, "administrador nao
 * reduz os proprios privilegios" e um 403 de app/api/users.py; aqui ele e
 * mostrado como erro acionavel, nao reimplementado.
 */

import { useCallback, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import * as api from "../../data/api.ts";
import type { Obra, Papel, Usuario } from "../../data/contracts.ts";
import { ApplicationError } from "../../data/errors.ts";
import { useApiData } from "../../data/useApiData.ts";
import { useAuth } from "../auth/AuthContext.tsx";

/** Mesma regra de app/usernames.py, exibida como ajuda no formulario. */
const REGRA_USUARIO =
  "3 a 32 caracteres, sem espacos. Letras, numeros, ponto, hifen e sublinhado.";

const PAPEIS: readonly Papel[] = [
  "administrador",
  "diretor",
  "engenheiro",
  "financeiro",
];

export function AdminPage() {
  const { usuario, ehAdministrador } = useAuth();

  const buscarUsuarios = useCallback((s: AbortSignal) => api.listarUsuarios(s), []);
  const usuarios = useApiData<Usuario[]>(buscarUsuarios, []);

  const buscarObras = useCallback((s: AbortSignal) => api.listarObras(s), []);
  const obras = useApiData<Obra[]>(buscarObras, []);

  const buscarArquivadas = useCallback(
    (s: AbortSignal) => api.listarObras(s, true),
    [],
  );
  const arquivadas = useApiData<Obra[]>(buscarArquivadas, []);

  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // A area inteira e administrativa: sem o papel, nao se renderiza nada dela.
  if (!ehAdministrador) {
    return (
      <main>
        <h1>Administracao</h1>
        <p role="alert">
          Esta area e restrita a administradores. Seu papel atual e{" "}
          {usuario?.role ?? "desconhecido"}.
        </p>
        <Link to="/">Voltar</Link>
      </main>
    );
  }

  async function executar(acao: () => Promise<unknown>, aoTerminar: () => void) {
    if (ocupado) return;
    setErro(null);
    setOcupado(true);
    try {
      await acao();
      aoTerminar();
    } catch (falha: unknown) {
      setErro(
        falha instanceof ApplicationError
          ? falha.message
          : "Nao foi possivel concluir a acao.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main>
      <h1>Administracao</h1>
      <Link to="/">Voltar ao acervo</Link>

      {erro !== null && <p role="alert">{erro}</p>}

      <BlocoUsuarios
        usuarios={usuarios}
        ocupado={ocupado}
        executar={executar}
        idDoUsuarioAtual={usuario?.id ?? null}
      />

      {/* Renderizado antes de qualquer guarda por obra: e aqui que a primeira
          obra de uma instalacao nova e criada. */}
      <BlocoObras obras={obras} ocupado={ocupado} executar={executar} />

      <BlocoAcessos usuarios={usuarios} obras={obras} ocupado={ocupado} executar={executar} />

      <BlocoRestaurar
        arquivadas={arquivadas}
        obras={obras}
        ocupado={ocupado}
        executar={executar}
      />
    </main>
  );
}

type Executar = (acao: () => Promise<unknown>, aoTerminar: () => void) => Promise<void>;

function BlocoUsuarios({
  usuarios,
  ocupado,
  executar,
  idDoUsuarioAtual,
}: {
  usuarios: ReturnType<typeof useApiData<Usuario[]>>;
  ocupado: boolean;
  executar: Executar;
  idDoUsuarioAtual: string | null;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [papel, setPapel] = useState<Papel>("engenheiro");

  function aoCriar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Confirmacao de senha: paridade com a UI anterior, onde ela foi adicionada
    // de proposito. Sem ela, um erro de digitacao cria um usuario que nunca
    // consegue entrar e so o administrador pode corrigir.
    if (senha !== confirmacao) {
      setErroSenha("As senhas nao conferem. Digite a mesma senha nos dois campos.");
      return;
    }
    setErroSenha(null);
    void executar(
      () => api.criarUsuario({ username, email, password: senha, role: papel }),
      () => {
        setUsername("");
        setEmail("");
        setSenha("");
        setConfirmacao("");
        usuarios.recarregar();
      },
    );
  }

  return (
    <section aria-labelledby="titulo-usuarios">
      <h2 id="titulo-usuarios">Usuarios</h2>

      <form onSubmit={aoCriar}>
        {erroSenha !== null && <p role="alert">{erroSenha}</p>}

        <label htmlFor="novo-username">Usuario</label>
        <input
          id="novo-username"
          aria-describedby="ajuda-username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
          }}
        />
        <small id="ajuda-username">{REGRA_USUARIO}</small>

        <label htmlFor="novo-email">E-mail</label>
        <input
          id="novo-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />

        <label htmlFor="nova-senha">Senha</label>
        <input
          id="nova-senha"
          type="password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
          }}
        />

        <label htmlFor="confirmar-senha">Confirmar senha</label>
        <input
          id="confirmar-senha"
          type="password"
          value={confirmacao}
          onChange={(e) => {
            setConfirmacao(e.target.value);
          }}
        />

        <label htmlFor="novo-papel">Papel</label>
        <select
          id="novo-papel"
          value={papel}
          onChange={(e) => {
            setPapel(e.target.value as Papel);
          }}
        >
          {PAPEIS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <button type="submit" disabled={ocupado}>
          Criar usuario
        </button>
      </form>

      {usuarios.estado.status === "loading" && <p role="status">Carregando usuarios...</p>}
      {usuarios.estado.status === "error" && (
        <p role="alert">{usuarios.estado.error.message}</p>
      )}

      {usuarios.estado.status === "success" && (
        <table>
          <caption>Usuarios cadastrados</caption>
          <thead>
            <tr>
              <th scope="col">Usuario</th>
              <th scope="col">Papel</th>
              <th scope="col">Situacao</th>
              <th scope="col">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.estado.data.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>
                  <label htmlFor={`papel-${u.id}`} className="rotulo-oculto">
                    Papel de {u.username}
                  </label>
                  <select
                    id={`papel-${u.id}`}
                    value={u.role}
                    disabled={ocupado}
                    onChange={(e) => {
                      void executar(
                        () =>
                          api.atualizarUsuario(u.id, { role: e.target.value as Papel }),
                        usuarios.recarregar,
                      );
                    }}
                  >
                    {PAPEIS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{u.is_active ? "ativo" : "inativo"}</td>
                <td>
                  {/* O rotulo do botao acompanha o estado do usuario: fora de um
                      form, para que a mudanca apareca sem novo envio. */}
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => {
                      void executar(
                        () => api.atualizarUsuario(u.id, { is_active: !u.is_active }),
                        usuarios.recarregar,
                      );
                    }}
                  >
                    {u.is_active ? `Desativar ${u.username}` : `Ativar ${u.username}`}
                  </button>
                  {u.id === idDoUsuarioAtual && <span> (voce)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function BlocoObras({
  obras,
  ocupado,
  executar,
}: {
  obras: ReturnType<typeof useApiData<Obra[]>>;
  ocupado: boolean;
  executar: Executar;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");

  function aoCriar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void executar(
      () => api.criarObra(nome, descricao),
      () => {
        setNome("");
        setDescricao("");
        obras.recarregar();
      },
    );
  }

  return (
    <section aria-labelledby="titulo-obras">
      <h2 id="titulo-obras">Obras</h2>

      <form onSubmit={aoCriar}>
        <label htmlFor="nova-obra-nome">Nome da obra</label>
        <input
          id="nova-obra-nome"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
          }}
        />
        <label htmlFor="nova-obra-descricao">Descricao</label>
        <input
          id="nova-obra-descricao"
          value={descricao}
          onChange={(e) => {
            setDescricao(e.target.value);
          }}
        />
        <button type="submit" disabled={ocupado}>
          Criar obra
        </button>
      </form>

      {obras.estado.status === "empty" && (
        <p>Nenhuma obra ativa. Crie a primeira acima.</p>
      )}

      {obras.estado.status === "success" && (
        <ul>
          {obras.estado.data.map((o) => (
            <li key={o.id}>
              {o.nome}{" "}
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  void executar(() => api.arquivarObra(o.id), () => {
                    obras.recarregar();
                  });
                }}
              >
                Arquivar {o.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BlocoRestaurar({
  arquivadas,
  obras,
  ocupado,
  executar,
}: {
  arquivadas: ReturnType<typeof useApiData<Obra[]>>;
  obras: ReturnType<typeof useApiData<Obra[]>>;
  ocupado: boolean;
  executar: Executar;
}) {
  // So obras arquivadas interessam aqui; GET /obras?arquivadas=true e admin-only
  // e existe justamente para uma obra arquivada seguir alcancavel.
  const lista =
    arquivadas.estado.status === "success"
      ? arquivadas.estado.data.filter((o) => o.is_deleted)
      : [];

  return (
    <section aria-labelledby="titulo-restaurar">
      <h2 id="titulo-restaurar">Obras arquivadas</h2>

      {lista.length === 0 ? (
        <p>Nenhuma obra arquivada.</p>
      ) : (
        <ul>
          {lista.map((o) => (
            <li key={o.id}>
              {o.nome}{" "}
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  void executar(() => api.restaurarObra(o.id), () => {
                    arquivadas.recarregar();
                    obras.recarregar();
                  });
                }}
              >
                Restaurar {o.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Atribuicao usuario -> obra.
 *
 * E o que define o escopo de engenheiro e financeiro: eles so enxergam obras a
 * que foram atribuidos (app/scope.py). Administrador e diretor tem acesso
 * global e nao precisam de atribuicao, mas a API aceita mesmo assim.
 */
function BlocoAcessos({
  usuarios,
  obras,
  ocupado,
  executar,
}: {
  usuarios: ReturnType<typeof useApiData<Usuario[]>>;
  obras: ReturnType<typeof useApiData<Obra[]>>;
  ocupado: boolean;
  executar: Executar;
}) {
  const [usuarioId, setUsuarioId] = useState("");
  const [obraId, setObraId] = useState("");

  const listaUsuarios =
    usuarios.estado.status === "success" ? usuarios.estado.data : [];
  const listaObras = obras.estado.status === "success" ? obras.estado.data : [];

  return (
    <section aria-labelledby="titulo-acessos">
      <h2 id="titulo-acessos">Acesso as obras</h2>

      {listaObras.length === 0 ? (
        <p>Crie uma obra para poder atribuir acessos.</p>
      ) : (
        <>
          <label htmlFor="acesso-usuario">Usuario</label>
          <select
            id="acesso-usuario"
            value={usuarioId}
            onChange={(e) => {
              setUsuarioId(e.target.value);
            }}
          >
            <option value="">selecione</option>
            {listaUsuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>

          <label htmlFor="acesso-obra">Obra</label>
          <select
            id="acesso-obra"
            value={obraId}
            onChange={(e) => {
              setObraId(e.target.value);
            }}
          >
            <option value="">selecione</option>
            {listaObras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={ocupado || usuarioId === "" || obraId === ""}
            onClick={() => {
              void executar(
                () => api.atribuirUsuarioAObra(obraId, usuarioId),
                () => {
                  obras.recarregar();
                },
              );
            }}
          >
            Conceder acesso
          </button>

          <button
            type="button"
            disabled={ocupado || usuarioId === "" || obraId === ""}
            onClick={() => {
              void executar(
                () => api.removerUsuarioDaObra(obraId, usuarioId),
                () => {
                  obras.recarregar();
                },
              );
            }}
          >
            Remover acesso
          </button>
        </>
      )}
    </section>
  );
}
