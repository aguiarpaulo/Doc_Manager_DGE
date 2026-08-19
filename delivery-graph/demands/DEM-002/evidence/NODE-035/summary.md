# NODE-035 — Visualizador de PDF com marcação de área

**Demanda:** DEM-002 · **Track:** TRK-signature-ui · **Requisitos:** REQ-020, REQ-027
**Depende de:** NODE-027, NODE-021 (`done`) · **Contrato: 6/6**

## O que entrou

| Arquivo | Papel |
|---|---|
| `features/assinatura/VisualizadorPdf.tsx` | Renderiza o PDF e recebe a marcação |
| `features/assinatura/SolicitarAssinatura.tsx` | Área + signatário + envio |
| `app/api/obras.py` | **`GET /obras/{id}/users`** — novo, ver abaixo |

**130 testes** no frontend (17 novos) e **226** no backend (3 novos), tudo limpo.

## Coordenadas em frações, nunca em pixels

O arrasto é dividido pelo tamanho renderizado da camada, então o resultado é o
mesmo em qualquer zoom. Há teste que faz o **mesmo retângulo relativo numa área
com o dobro do tamanho** e afirma que as frações saem idênticas.

E nada no cliente inverte o eixo: a origem continua no topo, como foi desenhada.
A conversão para o sistema do PDF acontece uma única vez, no servidor (NODE-033).
Há teste afirmando que o `y` enviado é o medido a partir do topo.

As dimensões da página vão em **pontos**, lidas do viewport do pdfjs — que é o que
o backend precisa registrar para tratar arquivos com páginas de tamanhos
diferentes.

## `pdfjs-dist` fora do chunk inicial

| Chunk | gzip | Quando |
|---|---|---|
| `index-*.js` | **84.34 kB** | sempre |
| `pdf-*.js` | **127.39 kB** | ao abrir um PDF |
| `pdf.worker.min-*.mjs` | 1.26 MB | idem |

Ligar o visualizador fez o chunk inicial subir de 82.35 para 84.34 kB — só o
código do componente. A dependência de 127 kB ficou de fora.

**Uma armadilha aqui:** na primeira tentativa o build mostrou um chunk só, e eu
quase registrei isso como prova. Não era — o componente ainda não estava ligado ao
app e havia sido eliminado por tree-shaking, então o import dinâmico nem existia
no grafo de módulos. A separação só é verificável depois que a funcionalidade está
alcançável.

## Um endpoint que faltava, descoberto aqui

A tela precisa listar candidatos a signatário. `GET /users` é **admin-only**
(`dependencies=[Depends(require_admin)]` no router), e o contrato do NODE-027 diz
que **o autor do documento pode solicitar** — autor que pode ser um engenheiro.
Ou seja: o fluxo aprovado no intake era impossível de completar pela interface.

Criei `GET /obras/{obra_id}/users`, legível por quem alcança a obra, devolvendo os
atribuídos mais os papéis de acesso global — exatamente o conjunto que
`app/scope.py` considera com acesso, e que portanto pode ser indicado como
signatário. Usuários inativos ficam de fora, porque pedir a eles daria 404 na
criação.

Verifiquei antes de mexer se `GET /users` era mesmo restrito; a proteção está no
router, não em cada função. Minha suspeita inicial de que estivesse aberto era
infundada.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Retângulo + signatário criam a solicitação | EVD-001 |
| 2 | Mesma posição em qualquer zoom | EVD-002 |
| 3 | Não-PDF não oferece a ação | EVD-003 |
| 4 | `pdfjs` fora do chunk inicial | EVD-004 |
| 5 | Posicionar e confirmar só com teclado | EVD-005 |
| 6 | Carga e falha distintas e acionáveis | EVD-006 |

## Teclado

`moverArea` é função pura, testada contra números: setas movem 1% da página, Shift
sobe para 10%, Alt redimensiona em vez de mover, e a área **nunca sai da página**
em nenhuma das operações. A camada de marcação tem `tabIndex`, `role="application"`
e uma descrição acessível que explica os atalhos.

## Limitações conhecidas

- **A renderização não é verificada por teste.** O jsdom não desenha PDF, então
  `pdfjs-dist` é simulado. Isso cobre a lógica — normalização, teclado, estados,
  tipos — e **não** prova que a página aparece. Isso é NODE-040.
- **Só uma área por vez.** Marcar para várias pessoas exige repetir o fluxo; o
  backend já aceita várias solicitações no mesmo documento.
- **Sem zoom nem rolagem por página.** As páginas trocam por um seletor.
- **A lista de candidatos inclui quem já tem pendência** naquele documento; pedir
  de novo devolve 409 do servidor, mostrado como erro.
- **O worker do pdfjs tem 1.26 MB** e não é comprimido pelo relatório. Fica fora
  do caminho inicial, mas é o maior artefato do projeto.
