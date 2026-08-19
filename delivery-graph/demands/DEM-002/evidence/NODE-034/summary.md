# NODE-034 — Registro da rubrica no primeiro acesso

**Demanda:** DEM-002 · **Track:** TRK-signature-ui · **Requisito:** REQ-019
**Depende de:** NODE-026, NODE-020 (`done`) · **Contrato: 6/6**
**Primeiro nó de interface da fase 2.**

## O que entrou

| Arquivo | Papel |
|---|---|
| `features/rubrica/CanvasRubrica.tsx` | Área de desenho por Pointer Events |
| `features/rubrica/RegistroRubricaPage.tsx` | Aviso de coleta + canvas + salvar |
| `features/rubrica/rubrica.css` | Estilo, só com tokens |
| `features/auth/RotaProtegida.tsx` | Guarda: sem rubrica não se entra |
| `features/auth/AuthContext.tsx` | `temRubrica` e `recarregarUsuario` |
| `data/api.ts` + `contracts.ts` | `registrarRubrica`, `baixarRubrica`, `apagarRubrica` |

**113 testes** no frontend (17 novos), `tsc` e `eslint` limpos, build 82.35 kB gzip.

## Um caminho só para mouse, dedo e caneta

O item 6 pede que o canvas funcione com mouse **e** com toque/caneta. Em vez de
tratar `mouse*` e `touch*` separadamente, o componente usa **Pointer Events**: um
único conjunto de manipuladores serve aos três. Há teste parametrizado que desenha
com `mouse`, `touch` e `pen` pelo mesmo caminho.

Dois detalhes que só aparecem em uso real e ficaram cobertos:
`setPointerCapture` para o traço não se perder se o dedo sair da área, e
`touch-action: none` para o navegador não rolar a página enquanto se desenha.

## O aviso vem antes do gesto

Não é ordem estética: um aviso exibido **depois** do desenho não informou
ninguém. O teste afirma a posição no documento
(`compareDocumentPosition` → `DOCUMENT_POSITION_FOLLOWING`), não só a presença do
texto.

O conteúdo cobre o que o GAP-004 decidiu: que é dado pessoal, para que serve, que
**nem um administrador** vê a rubrica alheia, que pode ser retirada a qualquer
momento — e que **as assinaturas já feitas continuam válidas**, porque cada uma
guarda a própria cópia do traço. Essa última frase é a promessa que o NODE-029
implementou, dita ao usuário.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Redireciona em qualquer rota protegida | EVD-001 |
| 2 | Canvas vazio não salva e informa | EVD-002 |
| 3 | Após salvar, segue ao destino pretendido | EVD-003 |
| 4 | Quem já tem rubrica nunca vê a tela | EVD-004 |
| 5 | Aviso de coleta antes do desenho | EVD-005 |
| 6 | Mouse, toque e caneta | EVD-006 |

## Detalhes

**O guarda não entra em laço** porque `/rubrica` está dentro da rota protegida mas
é excluída do redirecionamento por caminho. Há teste montando direto nela.

**`recarregarUsuario` existe por necessidade real:** o guarda decide por
`has_signature`, que vem de `/auth/me`. Sem reler o usuário depois de salvar, a
pessoa seria devolvida à tela de registro que acabou de concluir.

**O destino pretendido é preservado** — quem tentava abrir `/obras/obra-99` volta
para lá, não para a raiz. Mesma mecânica do login (NODE-020), agora encadeada:
anônimo → login → rubrica → destino.

## Uma consequência que a suíte cobrou

O guarda novo quebrou **5 testes** de auth, obras e administração, cujos fixtures
diziam `has_signature: false`. Não era bug: era o guarda funcionando em telas que
não tratam de rubrica. Atualizei os fixtures.

E o stub de canvas que adicionei ao `setup.ts` derrubou os **três arquivos de
integração**, que rodam em ambiente Node sem DOM — `HTMLCanvasElement is not
defined`. Protegido com uma verificação de existência.

## Limitações conhecidas

- **O traço em si não é verificado por teste.** O jsdom não implementa `<canvas>`,
  então o setup instala um duplo. Isso cobre a *lógica* — guarda, detecção de
  vazio, fluxo de salvar, tipos de ponteiro — e **não** prova que o desenho
  aparece. Isso é navegador, e pertence ao NODE-040. Está escrito no próprio
  `setup.ts` para ninguém confundir os dois.
- **Não há como trocar ou apagar a rubrica pela interface.** `baixarRubrica` e
  `apagarRubrica` existem na fronteira, mas falta uma tela de perfil — o direito
  de exclusão do GAP-004 hoje só é exercível pela API. **Lacuna real**, não
  coberta por nenhum nó do grafo.
- **Sem desfazer.** Só "Limpar", que apaga tudo.
- **O canvas tem tamanho fixo** (480×180) e encolhe por CSS; a conversão de
  coordenadas já trata isso, mas não há redimensionamento responsivo do buffer.
