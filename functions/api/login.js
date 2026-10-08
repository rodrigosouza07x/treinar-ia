// ==============================================================================
// POST /api/login  { email }
// Confere na Waid se o e-mail é de um membro e, se for, cria o cookie de sessão.
// Não guarda e-mails e não registra e-mails em log.
// ==============================================================================

import { verificarMembro } from '../_lib/waid.js';
import { criarToken, cookieDeSessao } from '../_lib/session.js';

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FALHAS_POR_HORA = 10;

const MSG_NEGADO =
  'Acesso negado. Use o mesmo e-mail do seu cadastro na Treinar Serviços. ' +
  'Se você acabou de comprar, aguarde alguns minutos e tente de novo.';
const MSG_INDISPONIVEL =
  'Não conseguimos verificar seu cadastro agora. Tente novamente em alguns minutos ou fale com o suporte.';

function resposta(corpo, status = 200, cabecalhosExtras = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cabecalhosExtras
    }
  });
}

// Limite de TENTATIVAS FALHAS por IP. Só grava no KV quando há falha,
// para economizar as gravações do plano gratuito.
function chaveFalhas(ip) {
  const hora = new Date().toISOString().slice(0, 13);
  return `loginfail:${hora}:${ip}`;
}

async function falhasExcedidas(env, ip) {
  const kv = env.CHAT_LIMITS_KV;
  if (!kv) return false;
  try {
    const valor = await kv.get(chaveFalhas(ip));
    return Number(valor || 0) >= MAX_FALHAS_POR_HORA;
  } catch {
    return false;
  }
}

async function registrarFalha(env, ip) {
  const kv = env.CHAT_LIMITS_KV;
  if (!kv) return;
  try {
    const chave = chaveFalhas(ip);
    const atual = Number((await kv.get(chave)) || 0);
    await kv.put(chave, String(atual + 1), { expirationTtl: 7200 });
  } catch {
    // ignora falha de gravação
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) {
    console.error('Login: SESSION_SECRET não configurado.');
    return resposta({ ok: false, message: 'Serviço de acesso não configurado. Avise o suporte da Treinar Serviços.' }, 503);
  }

  // Só aceita requisições vindas do próprio site
  const origem = request.headers.get('Origin');
  if (origem && origem !== new URL(request.url).origin) {
    return resposta({ ok: false, message: 'Origem não permitida.' }, 403);
  }

  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    return resposta({ ok: false, message: 'Requisição inválida.' }, 400);
  }

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return resposta({ ok: false, message: 'Requisição inválida.' }, 400);
  }

  // Campo-armadilha para robôs (invisível para pessoas)
  if (corpo && corpo.website) {
    return resposta({ ok: false, message: MSG_NEGADO }, 403);
  }

  const email = String((corpo && corpo.email) || '').trim().toLowerCase();
  if (!email || email.length > 254 || !REGEX_EMAIL.test(email)) {
    return resposta({ ok: false, message: 'Digite um e-mail válido.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
  if (await falhasExcedidas(env, ip)) {
    return resposta({ ok: false, message: 'Muitas tentativas. Tente novamente em cerca de uma hora ou fale com o suporte.' }, 429);
  }

  const resultado = await verificarMembro(email, env);

  if (resultado.status === 'ok') {
    const token = await criarToken(env.SESSION_SECRET);
    return resposta({ ok: true }, 200, { 'Set-Cookie': cookieDeSessao(token) });
  }

  if (resultado.status === 'negado') {
    await registrarFalha(env, ip);
    return resposta({ ok: false, message: MSG_NEGADO }, 403);
  }

  // 'config' ou 'indisponivel': problema nosso, não do aluno. Não conta como falha.
  return resposta({ ok: false, message: MSG_INDISPONIVEL }, 503);
}
