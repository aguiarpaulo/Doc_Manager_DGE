# NODE-047 — E2E estendido: recusa e exclusão de rubrica contra o stack real

**Demanda:** DEM-003 · **Track:** TRK-e2e · **Requisitos:** REQ-038, REQ-033
**Contrato: 6/6** · último nó da DEM-003

## O que entrou

`frontend/e2e/recusa-e-rubrica.spec.ts` — **7 specs, 7 passando** em Chromium
contra `docker-compose.test.yml`: Caddy servindo a SPA construída, FastAPI,
PostgreSQL, MinIO e Mailpit. Somado ao spec do NODE-040, a suíte roda **13/13**.

Nada aqui é simulado. Há um item de contrato dedicado a isso e ele é verificado
por um comando que varre `frontend/e2e/` procurando `vi.mock`, `jest.mock`, `msw`,
`nock` ou `mockResolvedValue` e reprova se achar qualquer um — a lição do
NODE-015 virou uma verificação executável, não uma promessa.

## A prova que dá sentido à demanda inteira

A tela de registro promete por escrito, desde o NODE-034, que apagar a rubrica
não invalida assinatura já feita. Provar isso com a fronteira simulada seria
circular. Aqui a prova é aritmética:

1. A signatária registra a rubrica desenhando com o mouse e assina o documento A.
2. Baixo o PDF carimbado e guardo o SHA-256.
3. Ela apaga a rubrica confirmando a senha.
4. Baixo o PDF carimbado de novo e exijo **o mesmo hash, byte a byte**.

Se o carimbo referenciasse a rubrica de perfil em vez de guardar cópia própria, o
segundo download falharia ou mudaria. Ele não muda.

## O guarda de rota corrigiu uma premissa minha

Escrevi primeiro que, depois de apagar, a signatária abriria a tela de assinatura
para conferir que a assinatura anterior continuava lá. **Falhou** — e estava certo
falhar: sem rubrica, o guarda a manda para o registro, que é exatamente o que o
NODE-043 exige. Meu teste é que estava errado.

"Segue consultável" só pode ser verificado por quem ainda tem acesso. O caso passou
a entrar como administrador e conferir a etapa na pasta da obra. O comportamento
do sistema não mudou; a minha leitura dele é que estava.

## Contrato — 6/6

| # | Item | Evidência |
|---|---|---|
| 1 | Recusa com justificativa em navegador + etapa na linha do tempo | EVD-001 |
| 2 | E-mail de recusa lido do Mailpit com documento e motivo | EVD-002 |
| 3 | Exclusão com senha; assinatura anterior consultável e imagem intacta | EVD-003 |
| 4 | Guarda exige o registro de novo, em navegador | EVD-004 |
| 5 | Nenhuma evidência com a fronteira HTTP simulada | EVD-005 |
| 6 | Relatório do Playwright anexado | EVD-006 |

Os quatro primeiros são execuções do **spec inteiro**, não filtradas por caso. A
jornada é `mode: "serial"` e compartilha obra, documentos e caixa de e-mail; rodar
um caso isolado com `-g` falha por falta do estado que a preparação cria. Tentei,
falhou, e a razão está registrada aqui em vez de contornada.

## Detalhes que valem registro

**A recusa é verificada nas duas pontas.** Na tela: o botão só aparece para a
signatária indicada, "Confirmar recusa" fica desabilitado sem motivo, a pendência
sai da tela depois. Na pasta da obra: a etapa `signature_declined` traz o nome de
quem recusou **e o motivo**. No Mailpit: o e-mail vai para quem *pediu*, não para
quem recusou, e traz documento, signatária e motivo.

**A senha errada é testada antes da certa**, nos dois diálogos — assinar e apagar.
Recusa de senha não pode consumir a pendência nem apagar a rubrica, e o teste
confirma que a rubrica continua na tela depois do erro.

**Usuária nova a cada execução** (`carla<marca>`), porque o stack persiste entre
runs e uma usuária reaproveitada já teria rubrica — apagando justamente o ciclo
registrar → assinar → apagar → ser exigida de novo que o arquivo existe para
provar.

## Limitações conhecidas

- **Só Chromium.** O `playwright.config.ts` define um projeto. Firefox e WebKit
  exigiriam navegadores adicionais e tempo de execução maior.
- **O stack é levantado à mão.** Não há `webServer` na config — de propósito, o
  alvo é a SPA construída e servida pelo Caddy — mas isso significa que
  `docker compose -f docker-compose.test.yml up -d --build` é passo manual, e não
  há CI que o execute (o projeto não tem `.github/workflows/`).
- **O carimbo não é inspecionado visualmente.** O teste prova que o PDF carimbado
  é estável e difere do original, não que a rubrica aparece no lugar certo da
  página. Comparação de imagem exigiria fixture de referência.
- **Cancelamento por administrador continua sem cobertura E2E** — segue como a
  pendência registrada na resolução do GAP-009.
