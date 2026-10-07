// ==============================================================================
// MONTAGEM DO SYSTEM PROMPT E BASE DE CONHECIMENTO
// ==============================================================================
import { SYSTEM_PROMPT_RAW } from './prompt.generated.js';
import { KNOWLEDGE_BASE } from './knowledge.generated.js';

/**
 * Retorna o system instruction completo unindo o prompt com a base de conhecimento técnica.
 * Conforme especificado, a base gerada é anexada logo após a seção "# BASE DE CONHECIMENTO".
 */
export function getSystemInstruction() {
  return `${SYSTEM_PROMPT_RAW}\n\n${KNOWLEDGE_BASE}`;
}
