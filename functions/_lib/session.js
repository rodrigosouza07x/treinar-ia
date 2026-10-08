// ==============================================================================
// SESSÃO POR COOKIE ASSINADO (HMAC-SHA256) - sem banco de dados e sem gravar no KV
// O cookie guarda só a data de validade. Nenhum e-mail é armazenado.
// ==============================================================================

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const NOME_COOKIE = 'treinar_sessao';
export const DURACAO_SEGUNDOS = 7 * 24 * 60 * 60; // 7 dias

function paraBase64Url(bytes) {
  let texto = '';
  for (const b of new Uint8Array(bytes)) texto += String.fromCharCode(b);
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binario = atob(b64);
  const saida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) saida[i] = binario.charCodeAt(i);
  return saida;
}

async function importarChave(segredo) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function criarToken(segredo, duracao = DURACAO_SEGUNDOS) {
  const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + duracao, v: 1 });
  const payloadB64 = paraBase64Url(encoder.encode(payload));
  const assinatura = await crypto.subtle.sign('HMAC', await importarChave(segredo), encoder.encode(payloadB64));
  return `${payloadB64}.${paraBase64Url(assinatura)}`;
}

export async function tokenValido(segredo, token) {
  try {
    if (!segredo || !token) return false;
    const [payloadB64, assinaturaB64] = token.split('.');
    if (!payloadB64 || !assinaturaB64) return false;

    const confere = await crypto.subtle.verify(
      'HMAC',
      await importarChave(segredo),
      deBase64Url(assinaturaB64),
      encoder.encode(payloadB64)
    );
    if (!confere) return false;

    const payload = JSON.parse(decoder.decode(deBase64Url(payloadB64)));
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function lerCookie(request, nome) {
  const cabecalho = request.headers.get('Cookie') || '';
  for (const parte of cabecalho.split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return resto.join('=');
  }
  return null;
}

export function cookieDeSessao(token, duracao = DURACAO_SEGUNDOS) {
  return `${NOME_COOKIE}=${token}; Max-Age=${duracao}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export async function sessaoValida(request, env) {
  return tokenValido(env.SESSION_SECRET, lerCookie(request, NOME_COOKIE));
}
