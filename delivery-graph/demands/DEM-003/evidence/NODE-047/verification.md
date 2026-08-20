# NODE-047 Verification

Node: E2E estendido: recusa e exclusao de rubrica contra o stack real
Verified: 2026-08-19T18:55:04.769Z

## Required evidence

- Um caso recusa com justificativa em navegador e verifica a etapa na linha do tempo: satisfied
  - EVD-001 [command]: node frontend/node_modules/@playwright/test/cli.js test --config frontend/playwright.config.ts e2e/recusa-e-rubrica.spec.ts passed
    - Artifact: artifacts/EVD-001-command.json
- O e-mail de recusa e lido do Mailpit e traz o documento e o motivo: satisfied
  - EVD-002 [command]: node frontend/node_modules/@playwright/test/cli.js test --config frontend/playwright.config.ts e2e/recusa-e-rubrica.spec.ts passed
    - Artifact: artifacts/EVD-002-command.json
- Um caso apaga a rubrica confirmando a senha e verifica que a assinatura anterior segue consultavel e com sua imagem intacta: satisfied
  - EVD-003 [command]: node frontend/node_modules/@playwright/test/cli.js test --config frontend/playwright.config.ts e2e/recusa-e-rubrica.spec.ts passed
    - Artifact: artifacts/EVD-003-command.json
- Depois de apagar a rubrica o guarda de rota exige o registro de novo em navegador: satisfied
  - EVD-004 [command]: node frontend/node_modules/@playwright/test/cli.js test --config frontend/playwright.config.ts e2e/recusa-e-rubrica.spec.ts passed
    - Artifact: artifacts/EVD-004-command.json
- Nenhuma evidencia deste no e produzida com a fronteira HTTP simulada: satisfied
  - EVD-005 [command]: node -e const fs=require('fs');const d='frontend/e2e';const proibido=/vi\.mock|jest\.mock|msw|mockResolvedValue|nock/;let mal=[];for(const f of fs.readdirSync(d)){const t=fs.readFileSync(d+'/'+f,'utf8');if(proibido.test(t))mal.push(f);if(!/@playwright\/test/.test(t))mal.push(f+' (nao usa Playwright)');}if(mal.length){console.error('specs com fronteira simulada:',mal.join(', '));process.exit(1);}console.log('nenhum mock em '+d+': todos os specs falam com o stack real'); passed
    - Artifact: artifacts/EVD-005-command.json
- Relatorio do Playwright anexado como artefato: satisfied
  - EVD-006 [manual]: Relatorio JSON do Playwright: 7 specs, 7 ok, execucao contra docker-compose.test.yml (Caddy + API + PostgreSQL + MinIO + Mailpit) em http://localhost:8080. A suite completa, somada ao spec do NODE-040, roda 13/13.
    - Artifact: artifacts/EVD-006-resultado.json
