# NODE-022 — Documentos na SPA

**Demanda:** DEM-002 · **Track:** TRK-spa-foundation · **Requisito:** REQ-026
**Depende de:** NODE-021 (`done`) · **Contrato: 6/6**

## O que foi feito

Upload, nova versão, download e fluxo de aprovação na SPA.

| Arquivo | Papel |
|---|---|
| `features/documentos/FormularioUpload.tsx` | Cria metadados + envia versão 1 |
| `features/documentos/AcoesDocumento.tsx` | Baixar, nova versão, análise, aprovar, rejeitar |
| `data/documentos.integration.test.ts` | Ciclo completo contra API + MinIO reais |

**82 testes** + 18 de integração ao vivo · `tsc` e `eslint` limpos.

## O achado que este nó produziu

Ao ler `app/api/documents.py` para escrever o teste ao vivo, descobri que **o
contrato escrito no NODE-019 estava errado em quatro pontos**:

| O que eu havia presumido | O que a API faz |
|---|---|
| `POST /documents` recebe FormData com arquivo | Recebe **JSON**; o arquivo vai depois em `/versions` |
| `/versions` devolve `DocumentRead` | Devolve **`DocumentVersionRead`** |
| `DocumentRead` expõe `approved_version` | **Não expõe** — a coluna existe no modelo, o schema não a serializa |
| `categoria` é texto livre | É o enum fechado `Category` |

Nenhum teste com a fronteira simulada pegaria isso: os mocks confirmavam a minha
invenção em vez do contrato do servidor. Foi ler o código da API e bater nela de
verdade que pegou. Corrigidos `contracts.ts` e `api.ts`; o typechecker então
apontou os três usos obsoletos.

É a lição do NODE-015 se repetindo — desta vez pega antes de chegar a produção.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Upload usa os tipos que a API valida; obra como UUID | EVD-001 (ao vivo) |
| 2 | Nova versão volta o status para enviado | EVD-003 |
| 3 | Duplicata por hash sinalizada | EVD-004 |
| 4 | Criador não decide sobre a própria submissão | EVD-005 |
| 5 | Transição inválida mostra o erro sem quebrar a tela | EVD-006 |
| 6 | Telas distinguem carga/revalidação/vazio/erro/sucesso | EVD-002 |

## Ambiente da verificação ao vivo

```
docker run -d -p 9010:9000 minio/minio server /data        # storage real
GED_MINIO_ENDPOINT=127.0.0.1:9010 uvicorn app.main:app     # API real
GET /health → {"database":"ok","storage":"ok"}
→ 11 passed
```

O que ficou provado contra o servidor de verdade: `obra_id` como UUID retorna
201 e como texto livre retorna **422 `uuid_parsing`**; o arquivo sobe ao MinIO
com SHA-256 hexadecimal; o download devolve `application/pdf`; conteúdo idêntico
na mesma obra dá **409**; nova versão zera o status para `enviado`; e o
`.exe` é recusado pelo gate de content type.

## Duas premissas minhas que a API real derrubou

**Aprovar direto de "enviado" devolve 403, não 409.** A API checa **autorização
antes da máquina de estados**, então o criador tentando aprovar leva 403 mesmo
quando a transição também seria inválida. Meu teste confundia as duas regras;
separei criando um diretor que não criou o documento para exercitar o 409.

**O `required` no input de arquivo impedia testar o caminho real.** O jsdom não
considera um `files` definido por script como constraint satisfeita
(`checkValidity() === false`, "Constraints not satisfied"), então o clique no
submit era bloqueado. Removi o atributo: o botão já fica desabilitado sem arquivo
e o envio tem guarda própria, de modo que ele não acrescentava garantia nenhuma —
só quebrava o teste da interação real.

## Decisões

**A UI não reimplementa a máquina de estados.** Ela oferece a ação e mostra o
erro que a API devolver. Duplicar `ALLOWED_TRANSITIONS` no cliente garantiria
divergência com o tempo.

**A validação de arquivo virou função pura exportada.** O atributo `accept`
impede que o navegador — e o `userEvent` — sequer anexem um tipo recusado, então
o caminho por interação não existe. A recusa do servidor está coberta ao vivo.

## Limitações conhecidas

- **O teste de integração é sequencial e compartilha estado.** Cada caso depende
  do anterior, então rodá-lo com `-t` filtrado falha. Por isso os seis itens
  apontam para a execução completa do arquivo. Torná-lo independente por caso
  custaria criar obra e documento em cada um; fica registrado como dívida.
- **Roda contra SQLite**, não PostgreSQL. Diferenças de dialeto entram no smoke
  de NODE-024.
- **`AcoesDocumento` não filtra ações por status.** Todos os botões aparecem
  sempre e a API recusa o que não cabe. É deliberado (ver decisão acima), mas
  gera cliques que sempre falham; esconder por status é melhoria de UX, não
  correção.
- **Sem barra de progresso no upload.** Arquivos de até 50 MB sobem sem
  indicação de andamento além do botão desabilitado.
