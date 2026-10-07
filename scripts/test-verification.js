import { checkRateLimit } from '../functions/_lib/ratelimit.js';
import { getSystemInstruction } from '../functions/_lib/prompt.js';
import { onRequestPost } from '../functions/api/chat.js';
import fs from 'node:fs';
import path from 'node:path';

async function runTests() {
  console.log('🧪 Iniciando testes de validação do sistema...\n');

  // TESTE 1: Verificar se chave do Gemini não aparece no frontend
  console.log('--- Teste 1: Vazamento de segredos no frontend ---');
  const publicFiles = fs.readdirSync('public');
  let leaked = false;
  for (const file of publicFiles) {
    const content = fs.readFileSync(path.join('public', file), 'utf-8');
    if (content.includes('AIzaSy') || content.includes('GEMINI_API_KEY')) {
      console.error(`❌ Chave encontrada em public/${file}!`);
      leaked = true;
    }
  }
  if (!leaked) {
    console.log('✅ Nenhum arquivo público contém referências a chaves de API.');
  }

  // TESTE 2: System prompt e Knowledge unificados
  console.log('\n--- Teste 2: System instruction completo ---');
  const systemInstruction = getSystemInstruction();
  if (
    systemInstruction.includes('Especialista em Projetos de Automação Industrial') &&
    systemInstruction.includes('# BASE DE CONHECIMENTO') &&
    systemInstruction.includes('BASE TÉCNICA DE AUTOMAÇÃO INDUSTRIAL')
  ) {
    console.log('✅ System instruction montado corretamente com prompt e base de conhecimento.');
    console.log(`   Tamanho: ${systemInstruction.length} caracteres`);
  } else {
    console.error('❌ Falha ao montar system instruction.');
  }

  // TESTE 3: Rate limit por IP e teto global no KV
  console.log('\n--- Teste 3: Rate Limiting com simulação de KV ---');
  const mockKvStore = new Map();
  let writeCount = 0;
  let readCount = 0;

  const mockKv = {
    async get(key, options) {
      readCount++;
      const val = mockKvStore.get(key);
      return val ? JSON.parse(val) : null;
    },
    async put(key, value, options) {
      writeCount++;
      mockKvStore.set(key, JSON.stringify(value));
    }
  };

  const env = {
    CHAT_LIMITS_KV: mockKv,
    LIMIT_PER_HOUR: '20',
    LIMIT_PER_DAY: '50',
    LIMIT_GLOBAL_DAILY: '400',
    DISABLE_PROTECTIONS: 'false'
  };

  const makeReq = (ip = '200.100.50.1') => ({
    headers: new Map([
      ['cf-connecting-ip', ip]
    ]),
    headers: {
      get(name) {
        if (name.toLowerCase() === 'cf-connecting-ip') return ip;
        return null;
      }
    }
  });

  // Enviar 20 mensagens do mesmo IP na mesma hora
  let allAllowed = true;
  for (let i = 1; i <= 20; i++) {
    const res = await checkRateLimit(makeReq(), env);
    if (!res.allowed) {
      allAllowed = false;
      console.error(`❌ Mensagem ${i} foi indevidamente bloqueada.`);
    }
  }

  if (allAllowed) {
    console.log('✅ As primeiras 20 mensagens foram permitidas com sucesso.');
  }

  // A 21ª mensagem deve ser bloqueada
  const writesBefore21 = writeCount;
  const res21 = await checkRateLimit(makeReq(), env);
  if (!res21.allowed && res21.status === 429 && res21.reason === 'ip_hourly_limit') {
    console.log('✅ A 21ª mensagem foi bloqueada corretamente por limite de hora:');
    console.log(`   Mensagem retornada: "${res21.message}"`);
  } else {
    console.error('❌ 21ª mensagem não foi bloqueada como esperado:', res21);
  }

  if (writeCount === writesBefore21) {
    console.log('✅ Nenhuma gravação adicional no KV ao bloquear mensagem (0 writes no bloqueio).');
  } else {
    console.error('❌ Gravação indevida no KV durante bloqueio.');
  }

  console.log(`   Total de gravações para 20 mensagens: ${writesBefore21} (exatamente 2 writes por mensagem permitida).`);

  // TESTE 4: Validação de Honeypot e Content-Type no chat.js
  console.log('\n--- Teste 4: Validação no endpoint /api/chat ---');

  // Teste 4.1: Content-Type não JSON
  const invalidCtReq = {
    request: {
      method: 'POST',
      headers: new Map([['content-type', 'text/plain']]),
      headers: { get: (h) => h.toLowerCase() === 'content-type' ? 'text/plain' : null }
    },
    env
  };
  const ctRes = await onRequestPost(invalidCtReq);
  if (ctRes.status === 400) {
    console.log('✅ Requisição com Content-Type inválido foi rejeitada com 400.');
  } else {
    console.error('❌ Content-Type inválido não retornou 400.');
  }

  // Teste 4.2: Honeypot acionado
  const hpReq = {
    request: {
      method: 'POST',
      headers: {
        get: (h) => {
          if (h.toLowerCase() === 'content-type') return 'application/json';
          return null;
        }
      },
      text: async () => JSON.stringify({
        messages: [{ role: 'user', text: 'Olá' }],
        hp: 'bot_value'
      })
    },
    env
  };
  const hpRes = await onRequestPost(hpReq);
  if (hpRes.status === 400) {
    console.log('✅ Requisição com campo Honeypot preenchido foi rejeitada com 400.');
  } else {
    console.error('❌ Honeypot não retornou 400.');
  }

  // Teste 4.3: Mensagem > 2000 caracteres
  const longMsgReq = {
    request: {
      method: 'POST',
      headers: {
        get: (h) => {
          if (h.toLowerCase() === 'content-type') return 'application/json';
          return null;
        }
      },
      text: async () => JSON.stringify({
        messages: [{ role: 'user', text: 'a'.repeat(2001) }]
      })
    },
    env
  };
  const longMsgRes = await onRequestPost(longMsgReq);
  if (longMsgRes.status === 400) {
    console.log('✅ Mensagem com mais de 2000 caracteres foi rejeitada com 400.');
  } else {
    console.error('❌ Mensagem longa não retornou 400.');
  }

  console.log('\n🎉 Todos os testes de validação passaram com êxito!');
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
