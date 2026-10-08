// ==============================================================================
// PORTEIRO DO SITE
// - Só ativa quando a variável REQUIRE_LOGIN for exatamente "true".
// - Protege a página do chat ("/") e toda a API (/api/*), exceto /api/login.
// - Sem sessão válida: página vai para /entrar e a API responde 401.
// Para desligar o login rapidamente: REQUIRE_LOGIN = "false" (ou apague a variável).
// ==============================================================================

import { sessaoValida } from './_lib/session.js';

function redirecionar(url, destino) {
  return new Response(null, {
    status: 302,
    headers: { Location: `${url.origin}${destino}`, 'Cache-Control': 'no-store' }
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;

  if (String(env.REQUIRE_LOGIN || 'false').toLowerCase() !== 'true') {
    return next();
  }

  const url = new URL(request.url);
  const caminho = url.pathname;

  if (caminho === '/api/login') return next();

  const ehApi = caminho.startsWith('/api/');
  const ehPaginaDoChat = caminho === '/' || caminho === '/index.html';
  const ehPaginaDeLogin = caminho === '/entrar' || caminho === '/entrar.html';

  // Arquivos comuns (css, js, imagens) passam direto: não têm segredos.
  if (!ehApi && !ehPaginaDoChat && !ehPaginaDeLogin) return next();

  const logado = await sessaoValida(request, env);

  if (ehPaginaDeLogin) {
    return logado ? redirecionar(url, '/') : next();
  }

  if (logado) return next();

  if (ehApi) {
    return new Response(
      JSON.stringify({ error: 'Sessão expirada. Atualize a página e entre novamente.' }),
      { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  return redirecionar(url, '/entrar');
}
