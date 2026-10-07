// ==============================================================================
// CLIENTE GEMINI API COM STREAMING SSE E GOOGLE SEARCH GROUNDING
// ==============================================================================

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
 * Executa a chamada com streaming à API do Gemini.
 * Trata Grounding com busca no Google e inclui fallback caso a busca atinja cotas.
 */
export async function streamGeminiChat({ messages, systemInstruction, env }) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chave de API do Gemini (GEMINI_API_KEY) não configurada.');
  }

  // Modelo padrão fixado em gemini-2.5-flash
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const basePayload = {
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: buildGeminiContents(messages),
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048
    }
  };

  // Tenta primeira chamada com busca na web (Grounding) habilitada
  let response;
  let searchFailed = false;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...basePayload,
        tools: [{ google_search: {} }]
      })
    });

    // Se falhar com erro 400 ou 403 especificamente na ferramenta de busca, tenta sem busca
    if (!response.ok && (response.status === 400 || response.status === 403)) {
      const errText = await response.text();
      // Não registrar dados do usuário, apenas sinalizar tentativa de recuperação
      console.warn('Aviso: Falha ao invocar busca web no Gemini. Tentando sem ferramentas:', response.status);
      searchFailed = true;

      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload)
      });
    }
  } catch (err) {
    console.error('Erro de conexão com o Gemini:', err);
    throw new Error('Não foi possível conectar ao serviço de inteligência artificial. Tente novamente em instantes.');
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Estou com muitas conversas agora. Tente novamente em alguns instantes.');
    }
    if (response.status >= 500) {
      throw new Error('O serviço de IA está temporariamente indisponível. Tente novamente em breve.');
    }
    throw new Error('Não foi possível processar sua solicitação no momento. Tente novamente.');
  }

  if (!response.body) {
    throw new Error('Resposta vazia recebida do serviço de IA.');
  }

  return {
    rawStream: response.body,
    searchFailed
  };
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
