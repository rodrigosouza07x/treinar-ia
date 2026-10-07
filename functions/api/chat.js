// ==============================================================================
// ENDPOINT BACKEND DO CHAT (/api/chat) - CLOUDFLARE PAGES FUNCTIONS
// ==============================================================================

import { getSystemInstruction } from '../_lib/prompt.js';
import { streamGeminiChat, createSSETransformStream } from '../_lib/gemini.js';
import { checkRateLimit, getClientIp } from '../_lib/ratelimit.js';
import { validateTurnstile } from '../_lib/turnstile.js';

/**
 * Tratamento de requisições POST para o chat
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Validar Content-Type
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return new Response(
      JSON.stringify({ error: 'Formato de requisição inválido. Envie JSON com cabeçalho application/json.' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }

  // 2. Validar Origem / CORS (permitir apenas mesma origem)
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestUrl = new URL(request.url);
      if (originUrl.host !== requestUrl.host) {
        return new Response(
          JSON.stringify({ error: 'Acesso não autorizado para esta origem.' }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          }
        );
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'Origem da requisição inválida.' }),
        { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }

  // 3. Validar Tamanho do Corpo (máximo 30 KB)
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 30 * 1024) {
    return new Response(
      JSON.stringify({ error: 'O tamanho da requisição excede o limite máximo permitido de 30 KB.' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }

  let rawBodyText = '';
  try {
    rawBodyText = await request.text();
    if (rawBodyText.length > 30 * 1024) {
      return new Response(
        JSON.stringify({ error: 'O corpo da requisição excede o limite de 30 KB.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Erro ao ler dados da requisição.' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 4. Fazer Parse do JSON
  let body;
  try {
    body = JSON.parse(rawBodyText);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Corpo da requisição não contém um JSON válido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 5. Verificação de Honeypot contra robôs
  if (body.website || body.hp) {
    return new Response(
      JSON.stringify({ error: 'Requisição inválida.' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // 6. Validar Histórico de Mensagens
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Lista de mensagens ausente ou vazia.' }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  // Restringe às últimas 12 mensagens do histórico
  const sanitizedMessages = body.messages.slice(-12);

  for (const msg of sanitizedMessages) {
    if (!msg || typeof msg !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Formato de mensagem inválido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    if (msg.role !== 'user' && msg.role !== 'assistant') {
      return new Response(
        JSON.stringify({ error: "Papel de mensagem inválido. Permitido apenas 'user' ou 'assistant'." }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    const text = typeof msg.text === 'string' ? msg.text : '';
    if (text.length > 2000) {
      return new Response(
        JSON.stringify({ error: 'Cada mensagem deve ter no máximo 2000 caracteres.' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }

  const clientIp = getClientIp(request);

  // 7. Validação do Turnstile (se configurado)
  const turnstileCheck = await validateTurnstile(request, body.turnstileToken, clientIp, env);
  if (!turnstileCheck.valid) {
    return new Response(
      JSON.stringify({ error: turnstileCheck.message }),
      {
        status: turnstileCheck.status || 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }

  // 8. Checagem de Rate Limit e Teto Global
  const rateLimitCheck = await checkRateLimit(request, env);
  if (!rateLimitCheck.allowed) {
    return new Response(
      JSON.stringify({ error: rateLimitCheck.message, reason: rateLimitCheck.reason }),
      {
        status: rateLimitCheck.status || 429,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }

  // 9. Obter System Instruction unificado e chamar Gemini com Streaming SSE
  try {
    const systemInstruction = getSystemInstruction();
    const { rawStream, searchFailed } = await streamGeminiChat({
      messages: sanitizedMessages,
      systemInstruction,
      env
    });

    const sseResponseStream = createSSETransformStream(rawStream, searchFailed);

    const headers = new Headers({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    if (turnstileCheck.cookieHeader) {
      headers.set('Set-Cookie', turnstileCheck.cookieHeader);
    }

    return new Response(sseResponseStream, {
      status: 200,
      headers
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro interno ao processar conversa.';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }
}

/**
 * Rejeitar outros métodos HTTP
 */
export async function onRequest(context) {
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }
  return new Response(
    JSON.stringify({ error: 'Método não permitido. Utilize POST.' }),
    {
      status: 405,
      headers: {
        'Allow': 'POST',
        'Content-Type': 'application/json; charset=utf-8'
      }
    }
  );
}
