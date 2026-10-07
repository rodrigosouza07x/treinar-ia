import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KNOWLEDGE_DIR = path.resolve(__dirname, '../knowledge');
const PROMPT_FILE = path.resolve(__dirname, '../prompt/system-prompt.md');
const KNOWLEDGE_OUTPUT_FILE = path.resolve(__dirname, '../functions/_lib/knowledge.generated.js');
const PROMPT_OUTPUT_FILE = path.resolve(__dirname, '../functions/_lib/prompt.generated.js');

function buildKnowledgeAndPrompt() {
  console.log('🔄 Compilando base de conhecimento técnica e system prompt da Treinar Serviços...');

  // 1. Processar Knowledge Base
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error(`❌ Diretório de conhecimento não encontrado: ${KNOWLEDGE_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(KNOWLEDGE_DIR)
    .filter(file => file.endsWith('.md') || file.endsWith('.txt'))
    .sort();

  if (files.length === 0) {
    console.warn('⚠️ Nenhum documento .md ou .txt encontrado na pasta knowledge.');
  }

  const sections = [];
  let totalChars = 0;

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    totalChars += content.length;

    sections.push(`### DOCUMENTO: ${file}\n\n${content}`);
    console.log(`  📄 Incluído na base: ${file} (${content.length} caracteres)`);
  }

  const aggregatedKnowledge = sections.join('\n\n---\n\n');
  const estimatedTokens = Math.ceil(totalChars / 3.5);

  console.log('\n📊 Estatísticas da Base de Conhecimento:');
  console.log(`  - Total de arquivos: ${files.length}`);
  console.log(`  - Total de caracteres: ${totalChars.toLocaleString('pt-BR')}`);
  console.log(`  - Estimativa de tokens: ${estimatedTokens.toLocaleString('pt-BR')} tokens (caracteres / 3.5)`);

  const TOKEN_LIMIT_WARNING = 120000;
  if (estimatedTokens > TOKEN_LIMIT_WARNING) {
    console.warn(`\n⚠️  ATENÇÃO: A base de conhecimento possui cerca de ${estimatedTokens.toLocaleString('pt-BR')} tokens, superando o limite recomendado de ${TOKEN_LIMIT_WARNING.toLocaleString('pt-BR')} tokens.`);
    console.warn('   Uma base muito extensa consome a cota gratuita do Gemini rapidamente a cada mensagem.');
    console.warn('   Recomenda-se planejar a migração para busca vetorial por trechos (RAG - Fase 2).\n');
  } else {
    console.log(`  ✅ Dentro do limite recomendado para cota gratuita (< ${TOKEN_LIMIT_WARNING.toLocaleString('pt-BR')} tokens).\n`);
  }

  // 2. Processar System Prompt
  if (!fs.existsSync(PROMPT_FILE)) {
    console.error(`❌ Arquivo de prompt não encontrado: ${PROMPT_FILE}`);
    process.exit(1);
  }
  const promptRaw = fs.readFileSync(PROMPT_FILE, 'utf-8').trim();
  console.log(`  🎯 System Prompt carregado: ${promptRaw.length} caracteres`);

  // 3. Escrever arquivos gerados
  fs.mkdirSync(path.dirname(KNOWLEDGE_OUTPUT_FILE), { recursive: true });

  const generatedKnowledge = `// ==============================================================================
// ARQUIVO GERADO AUTOMATICAMENTE POR scripts/build-knowledge.js
// NÃO MODIFIQUE ESTE ARQUIVO MANUALMENTE.
// Execute 'npm run build:knowledge' para recompilar após alterar /knowledge.
// ==============================================================================

export const KNOWLEDGE_BASE = ${JSON.stringify(aggregatedKnowledge)};

export const KNOWLEDGE_METADATA = {
  fileCount: ${files.length},
  totalChars: ${totalChars},
  estimatedTokens: ${estimatedTokens},
  generatedAt: ${JSON.stringify(new Date().toISOString())}
};
`;
  fs.writeFileSync(KNOWLEDGE_OUTPUT_FILE, generatedKnowledge, 'utf-8');

  const generatedPrompt = `// ==============================================================================
// ARQUIVO GERADO AUTOMATICAMENTE POR scripts/build-knowledge.js
// NÃO MODIFIQUE ESTE ARQUIVO MANUALMENTE.
// Execute 'npm run build:knowledge' para recompilar após alterar /prompt.
// ==============================================================================

export const SYSTEM_PROMPT_RAW = ${JSON.stringify(promptRaw)};
`;
  fs.writeFileSync(PROMPT_OUTPUT_FILE, generatedPrompt, 'utf-8');

  console.log(`✅ Base de conhecimento e prompt gerados com sucesso!\n`);
}

buildKnowledgeAndPrompt();
