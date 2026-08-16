/**
 * Guarda da sessao.
 *
 * Decisao de armazenamento, que e requisito do no e nao detalhe:
 *
 * - O **access token** vive apenas em memoria. Ele nunca toca `localStorage`
 *   nem `sessionStorage`, entao um XSS que consiga ler o armazenamento nao
 *   encontra a credencial de acesso ali.
 * - O **refresh token** vai para `sessionStorage`, nao `localStorage`: a sessao
 *   sobrevive a um F5 na mesma aba e termina quando a aba fecha. A base de
 *   conhecimento (secao 10.1) recomenda armazenamento de sessao quando nao ha
 *   necessidade de persistencia longa, e aqui nao ha.
 *
 * Nenhum dado pessoal do usuario e persistido: papel e identidade vem sempre de
 * `GET /auth/me`, nunca de algo guardado no cliente.
 */

const CHAVE_REFRESH = "ged.sessao.refresh";

let accessToken: string | null = null;

export function lerAccessToken(): string | null {
  return accessToken;
}

export function definirAccessToken(token: string | null): void {
  accessToken = token;
}

export function lerRefreshToken(): string | null {
  try {
    return window.sessionStorage.getItem(CHAVE_REFRESH);
  } catch {
    // Armazenamento indisponivel (modo restrito do navegador) nao pode derrubar
    // a aplicacao: sem refresh o usuario apenas relogara mais cedo.
    return null;
  }
}

export function definirRefreshToken(token: string | null): void {
  try {
    if (token === null) window.sessionStorage.removeItem(CHAVE_REFRESH);
    else window.sessionStorage.setItem(CHAVE_REFRESH, token);
  } catch {
    // Ignorado pelo mesmo motivo acima.
  }
}

export function limparSessao(): void {
  definirAccessToken(null);
  definirRefreshToken(null);
}
