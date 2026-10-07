// ==============================================================================
// CLIENTE GEMINI API COM STREAMING SSE, MODELOS RESERVA E BUSCA WEB OPCIONAL
// ==============================================================================
//
// Variáveis de ambiente usadas (todas opcionais, menos a chave):
//   GEMINI_API_KEY          (segredo, obrigatória)
//   GEMINI_MODEL            modelo principal (padrão: gemini-3.8-flash)
//   GEMINI_FALLBACK_MODELS  modelos reserva separados por vírgula
//   ENABLE_SEARCH           "true" liga a busca na web (padrão: desligada)
// ==============================================================================

const MODELOS_RESERVA_PADRAO =
  'gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-latest';

const NOTA_SEM_BUSCA =
  '\n\n# AVISO DO SISTEMA\n' +
  'A busca na web está DESATIVADA nesta versão. Não afirme ter pesquisado na internet nem cite fontes online. ' +
  'Responda com a base de conhecimento e seu conhecimento geral. Quando algo depender de dado atual ' +
  '(versão de software, preço, norma vigente, disponibilidade), avise que o usuário deve confirmar na fonte oficial do fabricante.';

/**
 * Cria a estrutura de conteúdos esperada pelo Gemini
 */
function buildGeminiContents(messages) {
  return messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.text || '' }]
  }));
}

/**
 * Monta o corpo da requisição (com ou sem busca na web)
 */
function buildPayload({ messages, systemInstruction, withSearch }) {
  const payload = {
    systemInstruction: {
      parts: [{ text: withSearch ? systemInstruction : systemInstruction + NOTA_SEM_BUSCA }]
    },
    contents: buildGeminiContents(messages),
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048
    }
  };
  if (withSearch) {
    payload.tools = [{ google_search: {} }];
  }
  return payload;
}

/**
 * Converte o último status de erro em mensagem amigável.
 */
function mensagemDeErro(status, configError) {
  if (configError) {
    return 'Houve um problema de configuração do serviço de IA. Avise o suporte da Treinar Serviços.';
  }
  if (status === 0) {
    return 'Não foi possível conectar ao serviço de inteligência artificial. Tente novamente em instantes.';
  }
  if (status === 429) {
    return 'Estou com muitas conversas agora. Tente novamente em alguns instantes.';
  }
  if (status === 404) {
    return 'O modelo de IA não está disponível no momento. Avise o suporte da Treinar Serviços.';
  }
  if (status >= 500) {
    return 'O serviço de IA está sobrecarregado neste momento. Tente novamente em alguns segundos.';
  }
  return 'Não foi possível processar sua solicitação no momento. Tente novamente.';
}

/**
 * Executa a chamada com streaming à API do Gemini.
 * - Tenta o modelo principal e, se ele falhar, os modelos reserva em ordem.
 * - A busca na web só é usada se ENABLE_SEARCH=true; se ela falhar, tenta sem busca.
 */
export async function streamGeminiChat({ messages, systemInstruction, env }) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Houve um problema de configuração do serviço de IA. Avise o suporte da Treinar Serviços.');
  }

  const principal = (env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  const reservas = (env.GEMINI_FALLBACK_MODELS || MODELOS_RESERVA_PADRAO)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const modelos = [principal, ...reservas.filter(m => m !== principal)];

  const buscaLigada = String(env.ENABLE_SEARCH || 'false').toLowerCase() === 'true';

  let ultimoStatus = 0;
  let erroDeConfiguracao = false;

  for (const model of modelos) {
    if (erroDeConfiguracao) break;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
    const tentativas = buscaLigada ? [true, false] : [false];
    let buscaFalhou = false;

    for (const comBusca of tentativas) {
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(buildPayload({ messages, systemInstruction, withSearch: comBusca }))
        });
      } catch (err) {
        // Falha de rede: registra (sem dados do usuário) e passa para o próximo modelo
        console.error('Erro de conexão com o Gemini no modelo:', model);
        ultimoStatus = 0;
        break;
      }

      if (response.ok && response.body) {
        return {
          rawStream: response.body,
          searchFailed: buscaLigada && buscaFalhou
        };
      }

      ultimoStatus = response.status;
      console.warn(`Gemini: modelo ${model} (busca=${comBusca}) respondeu ${response.status}`);
      try { await response.text(); } catch { /* ignora */ }

      // Se a busca falhou, tenta o mesmo modelo sem busca
      if (comBusca) {
        buscaFalhou = true;
        continue;
      }

      // Sem busca e erro de chave/permissão/requisição: trocar de modelo não resolve
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        erroDeConfiguracao = true;
      }
      break; // próximo modelo
    }
  }

  throw new Error(mensagemDeErro(ultimoStatus, erroDeConfiguracao));
}

/**
 * Transforma o fluxo SSE do Gemini em um ReadableStream SSE formatado para o frontend.
 * Envia texto incremental, metadados de busca (groundingChunks e searchEntryPoint) e finalização.
 */
export function createSSETransformStream(rawStream, searchFailed = false) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let buffer = '';
  const collectedSources = [];
  let collectedSearchEntryPoint = null;
  let hasTextOutput = false;

  const transformStream = new TransformStream({
    async transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          const candidate = parsed.candidates && parsed.candidates[0];

          if (!candidate) continue;

          // Verificar bloqueio por segurança
          if (candidate.finishReason === 'SAFETY') {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ text: '\n\n*(Resposta interrompida por diretrizes de segurança.)*' })}\n\n`
              )
            );
            continue;
          }

          // 1. Extrair texto gerado
          const parts = candidate.content && candidate.content.parts;
          if (parts && Array.isArray(parts)) {
            for (const part of parts) {
              if (part.text) {
                hasTextOutput = true;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: part.text })}\n\n`)
                );
              }
            }
          }

          // 2. Extrair metadados de Grounding (fontes e searchEntryPoint)
          const groundingMetadata = candidate.groundingMetadata;
          if (groundingMetadata) {
            // Chunks / fontes citadas
            if (Array.isArray(groundingMetadata.groundingChunks)) {
              for (const chunkItem of groundingMetadata.groundingChunks) {
                if (chunkItem.web && chunkItem.web.uri) {
                  const alreadyAdded = collectedSources.some(s => s.uri === chunkItem.web.uri);
                  if (!alreadyAdded) {
                    collectedSources.push({
                      title: chunkItem.web.title || chunkItem.web.uri,
                      uri: chunkItem.web.uri
                    });
                  }
                }
              }
            }

            // Ponto de entrada de busca (searchEntryPoint / Google Search Suggestions obrigatório)
            if (groundingMetadata.searchEntryPoint && groundingMetadata.searchEntryPoint.renderedContent) {
              collectedSearchEntryPoint = groundingMetadata.searchEntryPoint.renderedContent;
            }
          }
        } catch {
          // Ignora linhas de controle que não sejam JSON completo
        }
      }
    },
    flush(controller) {
      // Se não gerou nenhum texto e a busca falhou
      if (!hasTextOutput && searchFailed) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              text: 'Aviso: Não foi possível consultar a web neste momento. Resposta baseada no conhecimento interno.'
            })}\n\n`
          )
        );
      }

      // Envia metadados de Grounding caso existam
      if (collectedSources.length > 0 || collectedSearchEntryPoint) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'grounding',
              sources: collectedSources,
              searchEntryPoint: collectedSearchEntryPoint
            })}\n\n`
          )
        );
      }

      // Finaliza o stream SSE
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    }
  });

  return rawStream.pipeThrough(transformStream);
}
