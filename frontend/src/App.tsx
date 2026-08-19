/**
 * Composicao: roteador, provedores globais e shell.
 *
 * A ordem dos provedores e parte da arquitetura — um provedor so pode consumir
 * outro acima dele. Hoje so ha autenticacao; tema e dados compartilhados entram
 * acima ou abaixo dela conforme a dependencia, nunca por conveniencia.
 *
 * O `basename` sai do mesmo caminho-base do bundler, para que a aplicacao
 * funcione identica na raiz e sob um sub-caminho.
 */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AdminPage } from "./features/admin/AdminPage.tsx";
import { AuthProvider } from "./features/auth/AuthContext.tsx";
import { ForgotPasswordPage } from "./features/auth/ForgotPasswordPage.tsx";
import { LoginPage } from "./features/auth/LoginPage.tsx";
import { RotaProtegida } from "./features/auth/RotaProtegida.tsx";
import { EscolherObra } from "./features/obras/EscolherObra.tsx";
import { ObraShell } from "./features/obras/ObraShell.tsx";
import { AssinarDocumentoPage } from "./features/assinatura/AssinarDocumentoPage.tsx";
import { RegistroRubricaPage } from "./features/rubrica/RegistroRubricaPage.tsx";

function NaoEncontrado() {
  return (
    <main>
      <h1>Pagina nao encontrada</h1>
      <p>O endereco acessado nao existe neste sistema.</p>
    </main>
  );
}

export function Rotas() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/esqueci-minha-senha" element={<ForgotPasswordPage />} />
      <Route element={<RotaProtegida />}>
        {/* Fora do guarda de rubrica por construcao: e para ca que ele redireciona. */}
        <Route path="/rubrica" element={<RegistroRubricaPage />} />
        <Route path="/" element={<EscolherObra />} />
        {/* A obra e o documento vivem na URL: a tela e compartilhavel e o F5
            restaura exatamente o que estava aberto. */}
        <Route path="/obras/:obraId" element={<ObraShell />} />
        <Route path="/obras/:obraId/documentos/:documentoId" element={<ObraShell />} />
        <Route path="/administracao" element={<AdminPage />} />
        {/* Destino do link enviado por e-mail: o mesmo caminho que
            `signature_link` monta no servidor. */}
        <Route path="/documentos/:documentoId/assinar" element={<AssinarDocumentoPage />} />
      </Route>
      <Route path="/404" element={<NaoEncontrado />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Rotas />
      </AuthProvider>
    </BrowserRouter>
  );
}
