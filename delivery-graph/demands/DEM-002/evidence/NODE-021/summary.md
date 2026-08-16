# NODE-021 — Shell no modelo do SEI

**Demanda:** DEM-002 · **Track:** TRK-spa-foundation · **Requisito:** REQ-018
**Depende de:** NODE-020 (`done`) · **Contrato: 6/6**

## O que foi feito

A **obra passou a fazer o papel do processo**: seus documentos ficam listados à
esquerda em ordem de inclusão e o selecionado é renderizado ao lado, com barra
de ações no topo do painel e cabeçalho de identificação.

| Arquivo | Papel |
|---|---|
| `features/obras/ObraShell.tsx` | Shell: cabeçalho, lista, painel |
| `features/obras/EscolherObra.tsx` | Entrada: leva à primeira obra ou explica a ausência |
| `features/obras/shell.css` | Layout e regiões de rolagem, só com tokens |
| `features/documentos/PainelDocumento.tsx` | Barra de ações + conteúdo |
| `features/documentos/VisualizadorConteudo.tsx` | Despacho por Content-Type |

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | 3 documentos do mais antigo para o mais novo | EVD-001 |
| 2 | Selecionar renderiza ao lado sem recarregar | EVD-002 |
| 3 | Rota reflete obra e documento; F5 restaura | EVD-003 |
| 4 | Obra vazia mostra estado próprio, não erro | EVD-004 |
| 5 | Despacho por Content-Type, nunca por extensão | EVD-005 |
| 6 | Região de rolagem única; sem rolagem horizontal | EVD-006 |

**73 testes** (+7 ao vivo, ignorados por padrão), `tsc` e `eslint` limpos.

## Decisões

**O documento selecionado vive na URL, não no estado.** `/obras/:obraId/documentos/:documentoId`.
É o que torna a tela compartilhável e faz o F5 restaurar exatamente o que estava
aberto — há teste montando direto na rota profunda, que é o equivalente ao
recarregamento.

**A ordenação é função pura e testada à parte.** `ordenarPorInclusao` recebe a
lista fora de ordem (como no teste) e devolve do mais antigo para o mais novo,
com desempate estável por id e sem mutar a entrada. Ordem de inclusão é o que a
árvore do SEI mostra, e não dá para depender da ordem em que a API devolveu.

**Seleção não depende só de cor.** O item aberto usa `aria-current="true"`, barra
lateral e peso de fonte — três sinais, sendo um deles programático.

**Vazio e erro são caminhos separados.** Obra sem documentos mostra texto próprio
sem `role="alert"`; falha de carregamento mostra alerta com botão de nova
tentativa. Há teste afirmando que um não aparece no lugar do outro.

**O despacho de renderização ignora o nome do arquivo.** `classificar()` decide só
pelo Content-Type, tolera parâmetros (`; charset=utf-8`) e maiúsculas, e há teste
explícito de que um `.pdf` entregue como texto renderiza como texto. Tipos sem
prévia caem no download por desenho — mesmo critério da UI atual em Streamlit.

## Correção durante a execução

O `eslint-plugin-react-hooks` reprovou de novo `setState` dentro de efeito, agora
no visualizador. A URL do blob passou a ser **derivada** com `useMemo`, com o
efeito apenas revogando o recurso; e o estado do texto deixou de ser resetado
sincronamente. Terceira vez que essa regra pega algo neste projeto — vale como
padrão a seguir nos nós seguintes: *derive, não sincronize*.

## Limitações conhecidas

- **A barra de ações só exibe nome, versão e status.** Upload, nova versão,
  download, aprovar e rejeitar são NODE-022; a barra existe para recebê-los.
- **Sem paginação na lista de documentos.** Uma obra com centenas de documentos
  renderiza todos. Nenhum requisito trata volume; entra quando houver medida real.
- **A prova do item 6 é estrutural, não visual.** Verifica a estratégia declarada
  no CSS (100vh + overflow hidden na página, duas regiões roláveis, `min-width: 0`
  nos filhos flexíveis, zero `overflow-x`). Zoom 200%, conteúdo longo e barra
  horizontal real precisam de navegador — **NODE-024 (smoke) e NODE-040 (E2E)**.
- **`EscolherObra` leva sempre à primeira obra.** Não há memória da última obra
  visitada; se incomodar, é uma preferência persistida com TTL, não estado novo.
- O seletor de obra no cabeçalho não mostra obras arquivadas — correto para o uso
  diário, e a restauração é da área de administração (NODE-023).
