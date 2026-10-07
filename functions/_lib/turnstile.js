// ==============================================================================
// CLOUDFLARE TURNSTILE OPCIONAL COM COOKIE ASSINADO HMAC-SHA256 (30 MIN)
// ==============================================================================

const COOKIE_NAME = 'cf_turnstile_verified';
const COOKIE_MAX_AGE_SECONDS = 1800; // 30 minutos

/**
 * Converte um buffer para string hexadecimal
 */
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converte string hexadecimal para Uint8Array
 */
function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Gera assinatura HMAC-SHA256 usando Web Crypto API
 */
async function signMessage(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bufferToHex(signature);
}

/**
 * Verifica assinatura HMAC-SHA256
 */
async function verifyMessage(message, signatureHex, secret) {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBytes = hexToBuffer(signatureHex);
    return await crypto.subtle.verify('HMAC', key, signatureBytes, enc.encode(message));
  } catch {
    return false;
  }
}

/**
 * Extrai o valor de um cookie específico dos cabeçalhos da requisição
 */
function getCookieValue(request, cookieName) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name === cookieName) {
      return rest.join('=');
    }
  }
  return null;
}

/**
 * Valida o Turnstile se estiver habilitado via variáveis de ambiente
 */
export async function validateTurnstile(request, bodyToken, clientIp, env) {
  // Se proteções estiverem desativadas ou chaves não configuradas, Turnstile está desativado
  if (
    env.DISABLE_PROTECTIONS === 'true' ||
    !env.TURNSTILE_SITE_KEY ||
    !env.TURNSTILE_SECRET_KEY
  ) {
    return { enabled: false, valid: true };
  }

  const secretKey = env.TURNSTILE_SECRET_KEY;
  const cookieSecret = env.COOKIE_SECRET || secretKey;

  // 1. Verificar se existe cookie de sessão válido (30 min)
  const cookieValue = getCookieValue(request, COOKIE_NAME);
  if (cookieValue) {
    const [expiresAtStr, signature] = cookieValue.split('.');
    const expiresAt = parseInt(expiresAtStr, 10);

    if (expiresAt && signature && Date.now() < expiresAt) {
      const payload = `${clientIp}:${expiresAt}`;
      const isValidSignature = await verifyMessage(payload, signature, cookieSecret);
      if (isValidSignature) {
        return { enabled: true, valid: true, cookieHeader: null };
      }
    }
  }

  // 2. Se não houver cookie válido, validar o token enviado pelo frontend
  if (!bodyToken) {
    return {
      enabled: true,
      valid: false,
      status: 403,
      message: 'Validação de segurança pendente. Por favor, complete o desafio Turnstile.'
    };
  }

  try {
    const verifyFormData = new FormData();
    verifyFormData.append('secret', secretKey);
    verifyFormData.append('response', bodyToken);
    verifyFormData.append('remoteip', clientIp);

    const cfResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyFormData
    });

    const verifyResult = await cfResponse.json();

    if (!verifyResult.success) {
      return {
        enabled: true,
        valid: false,
        status: 403,
        message: 'Falha na validação de segurança. Atualize a página e tente novamente.'
      };
    }

    // 3. Gerar novo cookie assinado por 30 minutos
    const expiresAt = Date.now() + COOKIE_MAX_AGE_SECONDS * 1000;
    const payload = `${clientIp}:${expiresAt}`;
    const signature = await signMessage(payload, cookieSecret);
    const newCookieValue = `${expiresAt}.${signature}`;

    const setCookieHeader = `${COOKIE_NAME}=${newCookieValue}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;

    return {
      enabled: true,
      valid: true,
      cookieHeader: setCookieHeader
    };
  } catch (err) {
    console.error('Erro ao verificar Turnstile:', err);
    return {
      enabled: true,
      valid: false,
      status: 500,
      message: 'Erro interno ao validar desafio de segurança.'
    };
  }
}
