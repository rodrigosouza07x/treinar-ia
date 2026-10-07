# Especialista em Projetos de Automação Industrial — Treinar Serviços

Bem-vindo ao repositório do **Especialista em Projetos de Automação Industrial**, o assistente de inteligência artificial da **[Treinar Serviços](https://treinarservicos.com.br/)** voltado a alunos, técnicos e engenheiros para estruturação de projetos de automação (lógica de CLP, listas de entradas e saídas, IHM, inversores, custos e segurança NR-10/NR-12).

Este projeto foi construído para funcionar com **custo zero** utilizando a camada gratuita do **Cloudflare Pages** (com Pages Functions) e a API do **Google Gemini** (via Google AI Studio).

---

## Sumário
1. [Pré-requisitos e Instalação Local](#1-pré-requisitos-e-instalação-local)
2. [Configuração da Chave no `.dev.vars` e Execução Local](#2-configuração-da-chave-no-devvars-e-execução-local)
3. [Como Subir o Projeto para o GitHub](#3-como-subir-o-projeto-para-o-github)
4. [Publicação no Cloudflare Pages (Deploy Contínuo)](#4-publicação-no-cloudflare-pages-deploy-contínuo)
5. [Cálculo de Custos e Configuração do Cloudflare KV](#5-cálculo-de-custos-e-configuração-do-cloudflare-kv)
6. [Configuração Opcional do Cloudflare Turnstile](#6-configuração-opcional-do-cloudflare-turnstile)
7. [Configuração do Domínio `ia.treinarservicos.com.br`](#7-configuração-do-domínio-iatreinarservicoscombr)
8. [Como Adicionar Documentos à Base de Conhecimento](#8-como-adicionar-documentos-à-base-de-conhecimento)
9. [Como Trocar ou Atualizar o Modelo do Gemini](#9-como-trocar-ou-atualizar-o-modelo-do-gemini)
10. [Solução de Problemas Comuns](#10-solução-de-problemas-comuns)

---

## 1. Pré-requisitos e Instalação Local

Você precisará do **Node.js** (versão 18 ou superior) instalado no seu computador.

1. Para verificar se o Node.js já está instalado, abra o terminal e digite:
   ```bash
   node -v
   npm -v
   ```
   *Se você não tiver o Node.js instalado, baixe a versão LTS em [nodejs.org](https://nodejs.org/).*

2. No terminal, navegue até a pasta do projeto e instale as dependências executando:
   ```bash
   npm install
   ```

---

## 2. Configuração da Chave no `.dev.vars` e Execução Local

> ⚠️ **IMPORTANTE:** Nunca coloque sua chave secreta em arquivos públicos nem a envie para o GitHub. O arquivo `.dev.vars` e `minha-chave.txt` já estão protegidos pelo `.gitignore`.

1. Crie o seu arquivo `.dev.vars` a partir do modelo de exemplo:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Abra o arquivo `.dev.vars` em seu editor de texto e insira sua chave da API do Gemini obtida no [Google AI Studio](https://aistudio.google.com/):
   ```ini
   GEMINI_API_KEY=AIzaSySuaChaveRealAqui
   GEMINI_MODEL=gemini-2.5-flash
   LIMIT_PER_HOUR=20
   LIMIT_PER_DAY=50
   LIMIT_GLOBAL_DAILY=400
   DISABLE_PROTECTIONS=false
   ```

3. Inicie o servidor de desenvolvimento local:
   ```bash
   npm run dev
   ```
   Esse comando compilará a base de conhecimento técnica e iniciará o emulador local do Cloudflare Pages.

4. Abra o navegador no endereço exibido no terminal (normalmente `http://localhost:8788`).

---

## 3. Como Subir o Projeto para o GitHub

1. Se o repositório Git ainda não estiver inicializado na pasta, execute:
   ```bash
   git init
   git branch -M main
   ```

2. Adicione os arquivos e faça o primeiro commit:
   ```bash
   git add .
   git commit -m "feat: versão inicial do agente Treinar Serviços"
   ```

3. Crie um novo repositório no seu [GitHub](https://github.com/new) (privado ou público).

4. Conecte o repositório local ao GitHub e envie os arquivos:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```

---

## 4. Publicação no Cloudflare Pages (Deploy Contínuo)

1. Acesse o painel da [Cloudflare](https://dash.cloudflare.com/) e vá em **Workers & Pages** > **Create application** > aba **Pages** > **Connect to Git**.
2. Selecione a sua conta do GitHub e escolha o repositório que você acabou de subir.
3. Defina as configurações de Build:
   - **Framework preset:** `None`
   - **Build command:** `npm run build`
   - **Build output directory:** `public`
4. Na seção **Environment variables** (Variáveis de ambiente de Produção), adicione:
   - `GEMINI_API_KEY`: sua chave de API do Google AI Studio.
   - `GEMINI_MODEL`: `gemini-2.5-flash`
   - `LIMIT_PER_HOUR`: `20`
   - `LIMIT_PER_DAY`: `50`
   - `LIMIT_GLOBAL_DAILY`: `400`
   - `DISABLE_PROTECTIONS`: `false`
5. Clique em **Save and Deploy**. Em 1 ou 2 minutos seu projeto estará no ar em um link `.pages.dev`.

---

## 5. Cálculo de Custos e Configuração do Cloudflare KV

### Entendendo a Cota Gratuita do Cloudflare KV
Na camada gratuita da Cloudflare, o serviço **Workers KV** oferece:
- **100.000 leituras (reads)** por dia.
- **1.000 gravações (writes)** por dia (reset diário às 00:00 UTC).
- **1.000 exclusões e listagens** por dia.

### Como a Nossa Proteção Economiza Gravações
Para garantir que o agente funcione **100% dentro da cota gratuita sem custos surpresa**:
1. Cada mensagem permitida atualiza apenas **2 chaves** no KV:
   - **Registro do IP no dia:** chave `ip:AAAA-MM-DD:IP` (armazena tanto o total diário quanto a distribuição por hora em um único objeto JSON). Consome **1 write**.
   - **Registro global no dia:** chave `global:AAAA-MM-DD` (armazena a contagem total de mensagens do dia). Consome **1 write**.
2. Se uma mensagem for bloqueada por limite (teto do IP ou teto global), o sistema realiza apenas **leituras** e consome **0 gravações**.
3. **A Conta:**
   $$\text{Gravações por Mensagem} = 2 \text{ writes}$$
   $$\text{Teto Global Diário} = 400 \text{ mensagens}$$
   $$400 \text{ mensagens} \times 2 \text{ gravações} = 800 \text{ gravações por dia}$$
   Isso deixa uma margem segura de **200 gravações livres** abaixo do limite máximo de 1.000/dia.

### Conectando o KV em Produção (OBRIGATÓRIO)
> ⚠️ **Aviso:** O fallback em memória opera apenas no desenvolvimento local (`wrangler pages dev`). Em produção no Cloudflare Pages, o namespace KV é **obrigatório** para persistir as contagens entre os servidores globais de borda (edge). Se não estiver conectado, um aviso crítico será emitido no log.

Para criar e conectar o KV:
1. No painel da Cloudflare, vá em **Workers & Pages** > **KV** > **Create a namespace**.
2. Nomeie como: `treinar-chat-limits`.
3. Vá no seu projeto do Pages > **Settings** > **Functions** > **KV namespace bindings**.
4. Clique em **Add binding**:
   - **Variable name:** `CHAT_LIMITS_KV`
   - **KV namespace:** selecione `treinar-chat-limits`.
5. Faça um novo deploy ou clique em **Retry deployment** para ativar a conexão.

---

## 6. Configuração Opcional do Cloudflare Turnstile

O **Cloudflare Turnstile** é uma alternativa moderna, amigável e invisível ao CAPTCHA.

1. No painel da Cloudflare, vá em **Turnstile** > **Add widget**.
   - Nome: `Chat Treinar Serviços`
   - Domínio: `ia.treinarservicos.com.br` (e `localhost` para testes).
   - Modo: **Managed** (Invisível/Não interativo).
2. Copie a **Site Key** e a **Secret Key**.
3. Adicione nas variáveis de ambiente do Cloudflare Pages (e no `.dev.vars` se desejar testar localmente):
   - `TURNSTILE_SITE_KEY`: sua Site Key
   - `TURNSTILE_SECRET_KEY`: sua Secret Key
   - `COOKIE_SECRET`: uma frase longa aleatória (ex.: `treinar_chave_secreta_super_segura_2026`)
4. Com isso ativo, após validar a primeira mensagem de um usuário legítimo, o sistema gera um cookie seguro assinado com HMAC (válido por 30 minutos), dispensando verificações repetitivas.

---

## 7. Configuração do Domínio `ia.treinarservicos.com.br`

O site institucional da Treinar Serviços roda em WordPress no domínio raiz (`treinarservicos.com.br`). A publicação do agente no subdomínio `ia.treinarservicos.com.br` **não interfere em nada** no site WordPress:

1. No painel do Cloudflare Pages, acesse seu projeto > aba **Custom domains** > **Set up a custom domain**.
2. Digite: `ia.treinarservicos.com.br` e prossiga.
3. No gerenciador de DNS do seu domínio (no Cloudflare DNS ou na sua hospedagem):
   - **Tipo:** `CNAME`
   - **Nome / Host:** `ia`
   - **Destino:** `<seu-projeto>.pages.dev` (o link do seu projeto Pages)
   - **Proxy:** Ativado (nuvem laranja da Cloudflare)
4. O certificado SSL HTTPS será gerado automaticamente de forma gratuita pela Cloudflare em alguns minutos.

---

## 8. Como Adicionar Documentos à Base de Conhecimento

Você pode expandir os conhecimentos técnicos do assistente a qualquer momento adicionando arquivos `.md` (Markdown) ou `.txt`:

1. Coloque o novo arquivo técnico dentro da pasta `knowledge/` (exemplo: `knowledge/redes-industriais-profinet.md`).
2. Teste a compilação localmente:
   ```bash
   npm run build:knowledge
   ```
   O terminal informará a quantidade de caracteres e a estimativa de tokens.
   *Se a base ultrapassar 120.000 tokens, o script avisará que é hora de planejar a migração para busca vetorial por trechos (RAG).*
3. Faça o commit e envie para o GitHub:
   ```bash
   git add knowledge/ functions/_lib/knowledge.generated.js
   git commit -m "docs: adiciona guia de Profinet na base técnica"
   git push origin main
   ```
   O Cloudflare Pages recompilará e atualizará o chat automaticamente.

---

## 9. Como Trocar ou Atualizar o Modelo do Gemini

O modelo configurado por padrão é o **`gemini-2.5-flash`**.

> 💡 **Atenção:** Os nomes e versões dos modelos no Google AI Studio evoluem ao longo do tempo. Sempre verifique na documentação do [Google AI Studio](https://aistudio.google.com/) quais modelos Flash estão disponíveis na cota gratuita.

Para alterar o modelo utilizado:
- **Localmente:** edite a linha `GEMINI_MODEL=gemini-2.5-flash` no seu arquivo `.dev.vars`.
- **Em Produção:** acesse Cloudflare Pages > **Settings** > **Environment variables** > altere o valor de `GEMINI_MODEL` para o modelo desejado (ex.: uma nova versão Flash lançada pelo Google) e faça o redeploy.

---

## 10. Solução de Problemas Comuns

- **Erro 429 ("Estou com muitas conversas agora..."):**
  - Ocorre se um mesmo IP ultrapassar 20 mensagens em 1 hora ou 50 mensagens em 1 dia, ou se o total diário do chat passar de 400 mensagens.
  - Também pode indicar que a cota gratuita por minuto do Gemini no Google AI Studio foi atingida temporariamente. Aguarde 1 a 2 minutos e tente novamente.
- **Chat não responde ou erro 500:**
  - Verifique se a variável `GEMINI_API_KEY` está preenchida corretamente no `.dev.vars` (local) ou no painel da Cloudflare (produção).
  - Verifique os logs em tempo real na aba **Functions** > **Real-time logs** no painel do Cloudflare Pages.
- **Aviso no log: `[ALERTA CRÍTICO KV] Namespace CHAT_LIMITS_KV não configurado`:**
  - Em ambiente local, este aviso é esperado e o sistema usa fallback em memória.
  - Em produção, acerte o binding do KV conforme o passo 5 deste guia para garantir a persistência dos limites entre os servidores da Cloudflare.
- **Fontes da web e Google Search:**
  - O assistente utiliza a ferramenta de Grounding com busca no Google para dados verificáveis e normas vigentes. Conforme exigido pelos termos do serviço do Google, quando o modelo realiza buscas, os links das fontes e as sugestões de pesquisa são apresentados de forma clara ao final da resposta. Se a cota de buscas estiver esgotada no momento, o agente responderá utilizando a base interna e informará isso ao usuário.
