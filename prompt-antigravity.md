# MISSÃO

Você é um engenheiro full-stack sênior. Construa do zero o MVP de um agente de IA chamado **"Especialista em Projetos de Automação Industrial"**, da empresa Treinar Serviços (escola online de automação industrial, Brasil). O produto é uma página de chat pública, em português do Brasil, que será publicada em `ia.treinarservicos.com.br`. Técnicos, engenheiros e alunos conversam com o agente para planejar projetos de automação (definir entradas e saídas, estruturar lógica de CLP, estimar custos, tirar dúvidas técnicas).

A pessoa que vai usar este projeto é **iniciante em programação**. Explique em português simples o que você fez e o que ela precisa fazer, e não presuma conhecimento técnico.

**ANTES DE ESCREVER CÓDIGO:** gere um plano de implementação (estrutura de pastas, decisões técnicas, lista de suposições). Depois implemente tudo sem pedir confirmação a cada passo. Só pare para perguntar se algo for realmente bloqueante.

# ARQUIVOS QUE JÁ EXISTEM NA PASTA RAIZ

- `system-prompt.md`: instruções do agente. **Mova** para `prompt/system-prompt.md`. Não altere o conteúdo.
- `automacao-base.md`: base de conhecimento técnica. **Mova** para `knowledge/automacao-base.md`. Não altere o conteúdo.
- `minha-chave.txt`: contém a chave secreta da API. **NUNCA leia, abra, copie, exiba ou envie esse arquivo.** Adicione `minha-chave.txt` ao `.gitignore` e avise a pessoa, no fim, para colocar a chave manualmente no arquivo `.dev.vars` (descrito abaixo). Não crie nenhum arquivo `knowledge/treinar-servicos-empresa.md`: as informações da empresa já estão dentro do system prompt.

# RESTRIÇÕES DE CUSTO (CRÍTICO)

- Custo zero: apenas planos gratuitos. Hospedagem: **Cloudflare Pages com Pages Functions**. Motor de IA: **API do Gemini** (camada gratuita do Google AI Studio).
- Nada de banco de dados pago, serviços pagos ou dependências que exijam cartão de crédito.
- Sem login nem cadastro: o acesso é livre por link.

# STACK

- **Frontend:** HTML + CSS + JavaScript puro (vanilla), sem framework e sem build para a interface. Bibliotecas externas apenas via CDN: `marked` (Markdown) e `DOMPurify` (sanitização). Nunca insira HTML vindo do modelo sem sanitizar.
- **Backend:** Cloudflare Pages Functions em `functions/api/chat.js` (JavaScript, ES modules).
- Desenvolvimento local com `wrangler` (`wrangler pages dev`), com scripts prontos no `package.json` (`npm run dev`, `npm run build:knowledge`).
- Repositório pronto para conectar ao GitHub e fazer deploy automático no Cloudflare Pages.

# ESTRUTURA DE PASTAS

```
/
├─ public/                   (index.html, style.css, app.js, assets)
├─ functions/api/chat.js     (endpoint do chat, com streaming)
├─ functions/_lib/           (rate limit, turnstile opcional, gemini, prompt)
├─ prompt/system-prompt.md
├─ knowledge/automacao-base.md   (e futuros .md/.txt)
├─ scripts/build-knowledge.js
├─ package.json, wrangler.toml, .gitignore, .dev.vars.example
└─ README.md                 (passo a passo em português para iniciante)
```

# REQUISITOS FUNCIONAIS

## 1. Interface do chat (mobile-first; a maioria acessa pelo celular)

- Tema escuro, fundo `#000000` (mesma cor do site da Treinar), tipografia limpa, alto contraste. Logotipo no cabeçalho: `https://treinarservicos.com.br/wp-content/uploads/2025/05/ImagemLogoIcone01-1.webp` com o texto "Treinar Serviços · Especialista em Projetos de Automação".
- Mensagem de boas-vindas do agente ao abrir a página, curta e acolhedora, explicando o que ele faz e pedindo que o usuário descreva a máquina ou o processo que quer automatizar.
- Bloco **"Para começar a conversa"** com 4 chips arredondados clicáveis que enviam o texto como primeira mensagem. Textos **exatos**:
  1. "Olá! hoje eu quero automatizar uma máquina e um processo"
  2. "Quero ajuda para planejar meu projeto de automação industrial, me diga o que preciso."
  3. "Vamos estruturar juntos a lógica do meu CLP e calcular o custo do meu projeto?"
  4. "Me fale sobre meu equipamento e me ajude a definir entradas, saídas e lógica para o controle."
  Os chips somem depois da primeira mensagem enviada.
- Respostas em **streaming** com indicador de "digitando".
- **Markdown completo**: tabelas (essenciais para listas de E/S e lista de materiais), listas, negrito, blocos de código com fonte monoespaçada e botão "Copiar". Tabelas largas com rolagem horizontal no celular.
- Quando houver busca na web, mostrar as **fontes** como links clicáveis abaixo da resposta.
- Botões: **"Nova conversa"** (limpa tudo, com confirmação) e **"Exportar conversa"** (baixa um .md com a conversa).
- Histórico salvo no `localStorage` e restaurado ao recarregar.
- Campo de texto com altura automática, Enter envia e Shift+Enter quebra linha, limite de 2000 caracteres com contador discreto, botão enviar desabilitado enquanto responde e botão "Parar".
- Aviso discreto no rodapé: "Este assistente usa IA e pode errar. Confirme parâmetros e ligações no manual do fabricante e siga as normas de segurança (NR-10 e NR-12). Não envie dados pessoais nem informações confidenciais da sua empresa." com link para `https://treinarservicos.com.br/politica-de-privacidade/`.
- Rodapé com link para WhatsApp: `https://api.whatsapp.com/send/?phone=5531984617428&text=Ol%C3%A1%2C+gostaria+de+tirar+uma+d%C3%BAvida`
- Acessibilidade: foco visível, labels, `aria-live` na área de mensagens, contraste AA.
- Meta tags: título "Especialista em Projetos de Automação Industrial | Treinar Serviços", viewport, `theme-color #000000`, `robots noindex` (fácil de remover) e favicon com o logotipo.

## 2. Backend (`functions/api/chat.js`)

- Recebe POST com `{ messages: [{role, text}], turnstileToken? }`.
- Validações: últimas **12 mensagens** do histórico, **2000 caracteres** por mensagem do usuário, corpo total até 30 KB. Rejeite excessos com erro 400 em português.
- Chamada ao Gemini: `systemInstruction` = conteúdo de `prompt/system-prompt.md` + base de conhecimento gerada; `contents` = histórico; `temperature` 0.3; `maxOutputTokens` ~2048.
- **Streaming** com `streamGenerateContent` (`alt=sse`), repassando ao navegador como SSE. Ao final, enviar um evento separado com as fontes (`groundingMetadata`).
- A chave fica **somente** em variável de ambiente `GEMINI_API_KEY`. O nome do modelo vem de `GEMINI_MODEL` (nunca fixo no código). No README, mande conferir no Google AI Studio qual modelo Flash está disponível no plano gratuito.
- Erros amigáveis em português, sem vazar detalhes técnicos: 429 ("Estou com muitas conversas agora. Tente novamente em alguns instantes."), 5xx, timeout, resposta bloqueada por segurança, resposta vazia.
- Não registrar (log) o conteúdo das conversas.
- CORS: aceitar apenas a própria origem.

## 3. Base de conhecimento (pipeline)

- Os `.md` e `.txt` da pasta `/knowledge` serão lidos por `scripts/build-knowledge.js`, concatenados com cabeçalho por arquivo (`### DOCUMENTO: nome`) e gravados em `functions/_lib/knowledge.generated.js` (exporta uma string).
- O script roda automaticamente em `npm run dev` e como build command do Cloudflare Pages.
- Deve imprimir tamanho total e estimativa de tokens (caracteres / 3.5) e **avisar** se passar de 120.000 tokens, explicando que base muito grande consome a cota gratuita e que seria hora de usar busca por trechos (RAG).
- O `.gitignore` **não** deve ignorar `/knowledge` nem o arquivo gerado, para o deploy funcionar a partir do GitHub (ou rode o build no Cloudflare). Escolha a opção mais simples e documente.
- O conteúdo do system prompt termina com o título "# BASE DE CONHECIMENTO"; a base gerada é anexada logo depois.

## 4. Busca na web (Grounding com Google Search)

- Habilitar `tools: [{ google_search: {} }]` na requisição.
- Extrair `groundingMetadata` (`groundingChunks` com `web.uri` e `web.title`) e exibir como "Fontes". Consulte a documentação atual do Google sobre a obrigatoriedade de exibir sugestões de busca e implemente se for exigido.
- Se houver limite diário de buscas no plano gratuito e ele acabar, o agente continua respondendo **sem** busca e avisa que não consultou a web.

## 5. Proteção anti-abuso (acesso livre, sem login)

Em camadas, tudo no plano gratuito:
1. **Limite por IP**: padrão 20 mensagens por hora e 60 por dia (configurável).
2. **Teto global diário** de mensagens (padrão 800, configurável). Ao atingir, o chat avisa que o limite do dia acabou, convida a voltar amanhã e mostra o WhatsApp.
3. **Cloudflare Turnstile OPCIONAL**: só ativa se existirem `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`. Valide o token no backend e, após a primeira validação, emita um cookie assinado (HMAC, 30 min, HttpOnly, Secure, SameSite=Lax).
4. Honeypot simples e rejeição de requisições sem `Content-Type` JSON.
5. Contadores com **Cloudflare KV** (ou alternativa gratuita melhor), projetados para economizar escritas, documentando os limites do plano gratuito no README.
6. `DISABLE_PROTECTIONS=true` desliga limites e Turnstile **apenas em desenvolvimento local**.

## 6. Variáveis de ambiente (documentar em `.dev.vars.example` e no README)

`GEMINI_API_KEY`, `GEMINI_MODEL`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `COOKIE_SECRET`, `LIMIT_PER_HOUR`, `LIMIT_PER_DAY`, `LIMIT_GLOBAL_DAILY`, `DISABLE_PROTECTIONS`.

Crie `.dev.vars.example` com os nomes e valores de exemplo. **Não crie** o `.dev.vars` com chave real. Garanta que `.dev.vars` e `minha-chave.txt` estão no `.gitignore`.

## 7. README em português, para iniciante (passo a passo)

1. Instalar o Node.js (se necessário) e rodar `npm install` e `npm run dev`.
2. Onde colocar a chave no `.dev.vars` e como abrir a página local.
3. Subir o projeto para um repositório no GitHub.
4. Criar o projeto no Cloudflare Pages conectado ao GitHub (build command, pasta de saída, variáveis de ambiente, KV binding).
5. (Opcional) Criar o Turnstile.
6. Adicionar o domínio `ia.treinarservicos.com.br` no Cloudflare Pages e criar no DNS do domínio um CNAME `ia` apontando para o `.pages.dev` do projeto (o site WordPress não é afetado).
7. Como adicionar documentos em `/knowledge` e republicar.
8. Como trocar o modelo do Gemini.
9. Solução de problemas (erro 429, chat sem resposta, Turnstile falhando).

# CRITÉRIOS DE ACEITE (teste tudo antes de entregar)

- A página abre em 360 px de largura sem rolagem horizontal; os 4 chips funcionam e somem após o primeiro envio.
- A resposta chega em streaming; Markdown (tabelas e código) renderiza corretamente.
- HTML malicioso colado como mensagem ou devolvido pelo modelo **não executa** (teste com `<img src=x onerror=alert(1)>`).
- A chave do Gemini não aparece em nenhum arquivo do frontend nem nas respostas da rede.
- O 21º envio na mesma hora pelo mesmo IP é bloqueado com mensagem amigável.
- Uma pergunta de atualidade (ex.: "qual a diferença entre as linhas atuais de CLP da Siemens S7-1200 e S7-1500?") aciona a busca e mostra fontes.
- Uma pergunta fora do escopo (ex.: receita de bolo) é recusada com educação e redirecionada ao tema.

# ENTREGA FINAL

Ao terminar, entregue: (1) resumo do que foi feito em português simples, (2) lista de suposições, (3) lista do que a pessoa precisa fazer manualmente, na ordem: colocar a chave em `.dev.vars`, rodar localmente, subir ao GitHub, criar o projeto no Cloudflare, criar o CNAME.

# FASE 2 (NÃO IMPLEMENTAR AGORA; apenas deixar o código preparado)

Upload de foto (placa, diagrama, painel) para análise, busca por trechos (RAG) se a base crescer, login com a Curseduca, métricas anônimas de uso e botão de feedback (👍/👎) em cada resposta.
