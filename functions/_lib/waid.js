// ==============================================================================
// CONSULTA DE MEMBRO NA WAID (antiga Curseduca)
// Endpoint: GET https://prof.curseduca.pro/api/v1/members/by?email=EMAIL
// Autenticação: cabeçalho "api_key" + "Authorization: Bearer <Access Token>"
// ATENÇÃO: o Access Token da Waid vale 7 dias (renovação manual no painel).
// ==============================================================================

const BASE_URL = 'https://prof.curseduca.pro';
const TEMPO_LIMITE_MS = 8000;

/**
 * Procura, na resposta da Waid, um membro cujo e-mail seja exatamente o digitado.
 * Aceita objeto simples, { data: {...} }, { member: {...} } ou lista.
 */
function respostaContemEmail(dados, email, nivel = 0) {
  if (!dados || nivel > 3) return false;
  if (Array.isArray(dados)) return dados.some(item => respostaContemEmail(item, email, nivel + 1));
  if (typeof dados !== 'object') return false;

  if (typeof dados.email === 'string' && dados.email.trim().toLowerCase() === email) return true;

  for (const chave of ['data', 'member', 'user', 'items', 'results']) {
    if (dados[chave] && respostaContemEmail(dados[chave], email, nivel + 1)) return true;
  }
  return false;
}

/**
 * Retorna { status } com um destes valores:
 *  'ok'           e-mail é de um membro da Waid
 *  'negado'       e-mail não encontrado
 *  'config'       credenciais ausentes ou recusadas (ex.: token expirado)
 *  'indisponivel' Waid fora do ar, lenta ou resposta inesperada
 */
export async function verificarMembro(email, env) {
  if (!env.WAID_API_KEY || !env.WAID_ACCESS_TOKEN) {
    console.error('Waid: WAID_API_KEY ou WAID_ACCESS_TOKEN não configurados.');
    return { status: 'config' };
  }

  const controlador = new AbortController();
  const cronometro = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);

  try {
    const resposta = await fetch(`${BASE_URL}/api/v1/members/by?email=${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: {
        'api_key': env.WAID_API_KEY,
        'Authorization': `Bearer ${env.WAID_ACCESS_TOKEN}`,
        'Accept': 'application/json'
      },
      signal: controlador.signal
    });

    if (resposta.status === 404) return { status: 'negado' };

    if (resposta.status === 401 || resposta.status === 403) {
      console.error(`Waid: credenciais recusadas (HTTP ${resposta.status}). O Access Token provavelmente expirou. Renove em Credenciais API.`);
      return { status: 'config' };
    }

    if (!resposta.ok) {
      console.error(`Waid: resposta inesperada (HTTP ${resposta.status}).`);
      return { status: 'indisponivel' };
    }

    let dados;
    try {
      dados = await resposta.json();
    } catch {
      console.error('Waid: resposta sem JSON válido.');
      return { status: 'indisponivel' };
    }

    return respostaContemEmail(dados, email) ? { status: 'ok' } : { status: 'negado' };
  } catch (erro) {
    console.error('Waid: falha de conexão ou tempo esgotado.');
    return { status: 'indisponivel' };
  } finally {
    clearTimeout(cronometro);
  }
}
