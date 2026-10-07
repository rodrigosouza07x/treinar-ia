// ==============================================================================
// RATE LIMITING ANTI-ABUSO OTIMIZADO PARA CLOUDFLARE KV (PLANO GRATUITO)
// ==============================================================================

// Fallback em memória exclusivo para desenvolvimento local (wrangler pages dev)
const localMemoryStore = new Map();

/**
 * Sanitiza o IP do cliente para uso como chave segura no KV
 */
function sanitizeIp(ip) {
  if (!ip) return '127.0.0.1';
  return ip.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Obtém o IP real do cliente através dos cabeçalhos da Cloudflare
 */
export function getClientIp(request) {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }

  return '127.0.0.1';
}

/**
 * Adaptador para operações de KV com fallback em memória para desenvolvimento local
 */
function getKvAdapter(env) {
  const kv = env.CHAT_LIMITS_KV;

  if (kv) {
    return {
      isKv: true,
      async get(key) {
        const res = await kv.get(key, { type: 'json' });
        if (!res) return null;
        if (typeof res === 'string') {
          try {
            return JSON.parse(res);
          } catch {
            return null;
          }
        }
        return res;
      },
      async put(key, value, ttlSeconds = 172800) {
        await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
      }
    };
  }

  // Se não houver KV configurado:
  console.warn(
    '⚠️ [ALERTA CRÍTICO KV] Namespace CHAT_LIMITS_KV não configurado! ' +
    'Operando com armazenamento temporário em memória (apenas para desenvolvimento local). ' +
    'Em produção, vincule o KV no Cloudflare Pages.'
  );

  return {
    isKv: false,
    async get(key) {
      const item = localMemoryStore.get(key);
      if (!item) return null;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        localMemoryStore.delete(key);
        return null;
      }
      return item.data;
    },
    async put(key, value, ttlSeconds = 172800) {
      localMemoryStore.set(key, {
        data: value,
        expiresAt: Date.now() + ttlSeconds * 1000
      });
    }
  };
}

/**
 * Valida os limites de mensagens por IP e teto diário global.
 * Economiza gravações no KV (máximo 2 writes por mensagem permitida, 0 writes se bloqueado).
 */
export async function checkRateLimit(request, env) {
  // Desativação para desenvolvimento local quando especificado
  if (env.DISABLE_PROTECTIONS === 'true') {
    return { allowed: true };
  }

  const limitPerHour = parseInt(env.LIMIT_PER_HOUR, 10) || 20;
  const limitPerDay = parseInt(env.LIMIT_PER_DAY, 10) || 50;
  const limitGlobalDaily = parseInt(env.LIMIT_GLOBAL_DAILY, 10) || 400;

  const storage = getKvAdapter(env);

  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10); // Ex: 2026-10-07 (UTC)
  const hourKey = String(now.getUTCHours()); // 0 a 23

  const clientIp = getClientIp(request);
  const ipKey = `ip:${dateKey}:${sanitizeIp(clientIp)}`;
  const globalKey = `global:${dateKey}`;

  // 1. Verificar Teto Global Diário (1 leitura)
  const globalData = (await storage.get(globalKey)) || { count: 0 };
  const currentGlobalCount = globalData.count || 0;

  if (currentGlobalCount >= limitGlobalDaily) {
    return {
      allowed: false,
      status: 429,
      reason: 'global_daily_limit',
      message:
        'O assistente atingiu o limite de atendimentos gratuitos do dia. ' +
        'Por favor, volte amanhã ou fale diretamente com a equipe da Treinar Serviços pelo WhatsApp: ' +
        'https://api.whatsapp.com/send/?phone=5531984617428&text=Ol%C3%A1%2C+gostaria+de+tirar+uma+d%C3%BAvida'
    };
  }

  // 2. Verificar Registro do IP (1 leitura contendo contadores da hora e do dia)
  const ipData = (await storage.get(ipKey)) || { hourly: {}, dailyCount: 0 };
  const currentDailyCount = ipData.dailyCount || 0;
  const currentHourlyCount = (ipData.hourly && ipData.hourly[hourKey]) || 0;

  if (currentDailyCount >= limitPerDay) {
    return {
      allowed: false,
      status: 429,
      reason: 'ip_daily_limit',
      message:
        'Você atingiu o limite diário de mensagens gratuitas para este endereço. ' +
        'Volte amanhã ou continue tirando dúvidas pelo WhatsApp da Treinar Serviços: ' +
        'https://api.whatsapp.com/send/?phone=5531984617428&text=Ol%C3%A1%2C+gostaria+de+tirar+uma+d%C3%BAvida'
    };
  }

  if (currentHourlyCount >= limitPerHour) {
    return {
      allowed: false,
      status: 429,
      reason: 'ip_hourly_limit',
      message: 'Estou com muitas conversas agora. Tente novamente em alguns instantes.'
    };
  }

  // 3. Atualizar Contadores (Exatamente 2 gravações: 1 para o IP diário e 1 para o total global diário)
  // TTL de 2 dias (172.800 s) para expiração automática e limpeza de armazenamento
  ipData.dailyCount = currentDailyCount + 1;
  if (!ipData.hourly) ipData.hourly = {};
  ipData.hourly[hourKey] = currentHourlyCount + 1;

  globalData.count = currentGlobalCount + 1;

  await Promise.all([
    storage.put(ipKey, ipData, 172800),
    storage.put(globalKey, globalData, 172800)
  ]);

  return {
    allowed: true,
    remainingHour: limitPerHour - ipData.hourly[hourKey],
    remainingDay: limitPerDay - ipData.dailyCount
  };
}
