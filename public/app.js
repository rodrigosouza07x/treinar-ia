// ==============================================================================
// TREINAR SERVIÇOS - ESPECIALISTA EM PROJETOS DE AUTOMAÇÃO INDUSTRIAL
// LÓGICA DO CLIENTE (VANILLA JAVASCRIPT, STREAMING SSE, LOCALSTORAGE)
// ==============================================================================

(function () {
  'use strict';

  const STORAGE_KEY = 'treinar_chat_history_v1';
  const MAX_CHARS = 2000;

  // Elementos do DOM
  const chatMessages = document.getElementById('chat-messages');
  const starterChips = document.getElementById('starter-chips');
  const chatForm = document.getElementById('chat-form');
  const chatTextarea = document.getElementById('chat-textarea');
  const charCounter = document.getElementById('char-counter');
  const btnSend = document.getElementById('btn-send');
  const btnStop = document.getElementById('btn-stop');
  const btnNewChat = document.getElementById('btn-new-chat');
  const btnExport = document.getElementById('btn-export');
  const hpInput = document.getElementById('hp-input');
  const modalNewChat = document.getElementById('modal-new-chat');
  const modalBtnCancel = document.getElementById('modal-btn-cancel');
  const modalBtnConfirm = document.getElementById('modal-btn-confirm');

  // Estado da aplicação
  let messages = []; // [{ role: 'user' | 'assistant', text: string, sources?: [], searchEntryPoint?: string }]
  let activeAbortController = null;
  let isGenerating = false;

  // Configuração do Markdown (Marked + DOMPurify)
  function setupMarkdown() {
    if (typeof marked !== 'undefined') {
      const renderer = new marked.Renderer();

      // Envolve tabelas em container scrollável para celular
      renderer.table = function (header, body) {
        return `<div class="table-container"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
      };

      // Adiciona cabeçalho com botão "Copiar" aos blocos de código
      renderer.code = function (code, lang) {
        const safeLang = (lang || '').trim();
        return `<div class="code-block-wrapper">
          <div class="code-block-header">
            <span class="code-lang">${safeLang || 'código'}</span>
            <button class="btn-copy-code" type="button" aria-label="Copiar código">Copiar</button>
          </div>
          <pre><code class="${safeLang ? 'language-' + safeLang : ''}">${escapeHtml(code)}</code></pre>
        </div>`;
      };

      // Links sempre abrem em nova aba com segurança
      const originalLink = renderer.link.bind(renderer);
      renderer.link = function (href, title, text) {
        const rendered = originalLink(href, title, text);
        return rendered.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ');
      };

      marked.use({ renderer, gfm: true, breaks: true });
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderContent(text) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      const rawHtml = marked.parse(text || '');
      return DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ['target', 'rel'],
        FORBID_TAGS: ['style'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick']
      });
    }
    return escapeHtml(text || '');
  }

  // ============================================================================
  // PERSISTÊNCIA (LOCALSTORAGE)
  // ============================================================================

  function loadHistory() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          messages = parsed;
          renderAllMessages();
          if (starterChips) starterChips.style.display = 'none';
          return;
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar histórico local:', e);
    }
    // Se não há histórico salvo, exibe boas-vindas inicial e chips
    messages = [];
    if (starterChips) starterChips.style.display = 'flex';
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.warn('Erro ao salvar histórico local:', e);
    }
  }

  // ============================================================================
  // RENDERIZAÇÃO DE MENSAGENS NA INTERFACE
  // ============================================================================

  function renderAllMessages() {
    // Preserva boas-vindas se não houver mensagens
    const welcomeEl = document.getElementById('welcome-message');
    chatMessages.innerHTML = '';

    if (messages.length === 0 && welcomeEl) {
      chatMessages.appendChild(welcomeEl);
      if (starterChips) chatMessages.appendChild(starterChips);
      return;
    }

    // Renderiza cada mensagem salva
    for (const msg of messages) {
      appendMessageToDOM(msg);
    }

    scrollToBottom();
  }

  function appendMessageToDOM(msg) {
    const article = document.createElement('article');
    article.className = `message message-${msg.role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = msg.role === 'assistant' ? 'IA' : 'Você';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content';

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'message-body';
    bodyDiv.innerHTML = renderContent(msg.text);

    contentWrapper.appendChild(bodyDiv);

    // Fontes citadas (Grounding)
    if (msg.sources && msg.sources.length > 0) {
      const sourcesEl = createSourcesElement(msg.sources);
      contentWrapper.appendChild(sourcesEl);
    }

    // Ponto de entrada de pesquisa do Google (obrigatório se retornado)
    if (msg.searchEntryPoint) {
      const searchEl = createSearchEntryPointElement(msg.searchEntryPoint);
      contentWrapper.appendChild(searchEl);
    }

    article.appendChild(avatar);
    article.appendChild(contentWrapper);

    chatMessages.appendChild(article);
    return { article, bodyDiv, contentWrapper };
  }

  function createSourcesElement(sources) {
    const div = document.createElement('div');
    div.className = 'message-sources';

    const title = document.createElement('div');
    title.className = 'sources-title';
    title.innerHTML = '🔍 Fontes consultadas:';
    div.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'sources-list';

    for (const src of sources) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'source-link';
      a.href = src.uri;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = src.title || src.uri;
      li.appendChild(a);
      list.appendChild(li);
    }

    div.appendChild(list);
    return div;
  }

  function createSearchEntryPointElement(renderedContent) {
    const div = document.createElement('div');
    div.className = 'message-search-entrypoint';
    if (typeof DOMPurify !== 'undefined') {
      div.innerHTML = DOMPurify.sanitize(renderedContent, {
        ADD_ATTR: ['target', 'rel']
      });
    } else {
      div.textContent = renderedContent;
    }
    return div;
  }

  function scrollToBottom() {
    const chatMain = document.querySelector('.chat-main');
    if (chatMain) {
      chatMain.scrollTop = chatMain.scrollHeight;
    }
  }

  // ============================================================================
  // ENVIO E STREAMING DE MENSAGENS
  // ============================================================================

  async function sendMessage(textToSend) {
    const text = (textToSend || chatTextarea.value).trim();
    if (!text || isGenerating) return;

    if (text.length > MAX_CHARS) {
      alert(`Sua mensagem ultrapassa o limite de ${MAX_CHARS} caracteres.`);
      return;
    }

    // Esconde chips de início na primeira mensagem
    if (starterChips) {
      starterChips.style.display = 'none';
    }

    // 1. Adicionar mensagem do usuário
    const userMsg = { role: 'user', text };
    messages.push(userMsg);
    appendMessageToDOM(userMsg);
    saveHistory();

    // Limpar textarea e redefinir altura
    chatTextarea.value = '';
    updateCharCounter();
    autoResizeTextarea();

    // 2. Criar bolha de resposta do assistente com indicador de digitação
    setGeneratingState(true);

    const assistantMsg = { role: 'assistant', text: '', sources: [], searchEntryPoint: null };
    const { bodyDiv, contentWrapper } = appendMessageToDOM(assistantMsg);

    bodyDiv.innerHTML = '<span class="streaming-indicator" aria-label="digitando..."></span>';
    scrollToBottom();

    activeAbortController = new AbortController();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: messages.slice(-12),
          hp: hpInput ? hpInput.value : ''
        }),
        signal: activeAbortController.signal
      });

      if (!response.ok) {
        let errDesc = 'Erro ao se comunicar com o assistente.';
        try {
          const errData = await response.json();
          if (errData.error) errDesc = errData.error;
        } catch {
          // Usa mensagem padrão
        }
        bodyDiv.innerHTML = `<p style="color: var(--color-danger);">${escapeHtml(errDesc)}</p>`;
        assistantMsg.text = `[Erro: ${errDesc}]`;
        messages.push(assistantMsg);
        saveHistory();
        return;
      }

      // Leitura do fluxo SSE
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let partialChunk = '';
      let fullAssistantText = '';
      let collectedSources = [];
      let collectedSearchEntryPoint = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        partialChunk += decoder.decode(value, { stream: true });
        const lines = partialChunk.split('\n');
        partialChunk = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataContent = trimmed.replace(/^data:\s*/, '');
          if (dataContent === '[DONE]') {
            break;
          }

          try {
            const dataObj = JSON.parse(dataContent);

            // Texto incremental
            if (dataObj.text) {
              fullAssistantText += dataObj.text;
              bodyDiv.innerHTML =
                renderContent(fullAssistantText) +
                '<span class="streaming-indicator" aria-label="digitando..."></span>';
              scrollToBottom();
            }

            // Metadados de busca (Grounding)
            if (dataObj.type === 'grounding') {
              if (Array.isArray(dataObj.sources)) {
                collectedSources = dataObj.sources;
              }
              if (dataObj.searchEntryPoint) {
                collectedSearchEntryPoint = dataObj.searchEntryPoint;
              }
            }
          } catch {
            // Ignora linhas que não formam JSON completo
          }
        }
      }

      // Finalizar visualização sem o indicador piscante
      bodyDiv.innerHTML = renderContent(fullAssistantText);

      // Anexar fontes e searchEntryPoint se recebidos
      if (collectedSources.length > 0) {
        contentWrapper.appendChild(createSourcesElement(collectedSources));
      }
      if (collectedSearchEntryPoint) {
        contentWrapper.appendChild(createSearchEntryPointElement(collectedSearchEntryPoint));
      }

      assistantMsg.text = fullAssistantText;
      assistantMsg.sources = collectedSources;
      assistantMsg.searchEntryPoint = collectedSearchEntryPoint;

      messages.push(assistantMsg);
      saveHistory();
    } catch (err) {
      if (err.name === 'AbortError') {
        bodyDiv.innerHTML =
          renderContent(assistantMsg.text) +
          '<p><em>(Resposta interrompida pelo usuário)</em></p>';
        assistantMsg.text += ' (Resposta interrompida pelo usuário)';
        messages.push(assistantMsg);
        saveHistory();
      } else {
        console.error('Erro de requisição:', err);
        bodyDiv.innerHTML =
          '<p style="color: var(--color-danger);">Não foi possível carregar a resposta. Verifique sua conexão e tente novamente.</p>';
      }
    } finally {
      setGeneratingState(false);
      activeAbortController = null;
      scrollToBottom();
    }
  }

  function setGeneratingState(generating) {
    isGenerating = generating;
    btnSend.disabled = generating;
    btnStop.style.display = generating ? 'inline-flex' : 'none';
  }

  // ============================================================================
  // AJUSTE DE ALTURA E CONTADOR DO TEXTAREA
  // ============================================================================

  function autoResizeTextarea() {
    chatTextarea.style.height = 'auto';
    chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 160) + 'px';
  }

  function updateCharCounter() {
    const len = chatTextarea.value.length;
    charCounter.textContent = `${len} / ${MAX_CHARS}`;

    if (len >= MAX_CHARS) {
      charCounter.className = 'char-counter limit';
    } else if (len > MAX_CHARS * 0.9) {
      charCounter.className = 'char-counter warning';
    } else {
      charCounter.className = 'char-counter';
    }
  }

  // ============================================================================
  // EXPORTAÇÃO DE CONVERSA EM MARKDOWN (.md)
  // ============================================================================

  function exportConversation() {
    if (messages.length === 0) {
      alert('Não há mensagens na conversa para exportar.');
      return;
    }

    const now = new Date();
    const dateFormatted = now.toLocaleDateString('pt-BR');
    const timeFormatted = now.toLocaleTimeString('pt-BR');

    let md = `# Conversa com Especialista em Projetos de Automação Industrial\n`;
    md += `**Treinar Serviços** (ia.treinarservicos.com.br)\n`;
    md += `*Data da exportação: ${dateFormatted} às ${timeFormatted}*\n\n`;
    md += `---\n\n`;

    for (const msg of messages) {
      if (msg.role === 'user') {
        md += `### 👤 Você:\n\n${msg.text}\n\n`;
      } else {
        md += `### 🤖 Especialista em Automação (Treinar Serviços):\n\n${msg.text}\n\n`;
        if (msg.sources && msg.sources.length > 0) {
          md += `**Fontes consultadas:**\n`;
          for (const s of msg.sources) {
            md += `- [${s.title}](${s.uri})\n`;
          }
          md += `\n`;
        }
      }
      md += `---\n\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileDate = now.toISOString().slice(0, 10);
    link.href = url;
    link.download = `conversa-automacao-treinar-${fileDate}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================

  function setupEventListeners() {
    // Envio pelo formulário
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      sendMessage();
    });

    // Envio com Enter (e Shift+Enter para nova linha)
    chatTextarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Entrada no textarea
    chatTextarea.addEventListener('input', function () {
      updateCharCounter();
      autoResizeTextarea();
    });

    // Botão de parar geração
    btnStop.addEventListener('click', function () {
      if (activeAbortController) {
        activeAbortController.abort();
      }
    });

    // Chips de início rápido
    if (starterChips) {
      starterChips.addEventListener('click', function (e) {
        const btn = e.target.closest('.chip-btn');
        if (btn) {
          const prompt = btn.getAttribute('data-prompt');
          if (prompt) {
            sendMessage(prompt);
          }
        }
      });
    }

    // Copiar código em blocos Markdown
    chatMessages.addEventListener('click', function (e) {
      if (e.target && e.target.classList.contains('btn-copy-code')) {
        const wrapper = e.target.closest('.code-block-wrapper');
        const codeEl = wrapper ? wrapper.querySelector('code') : null;
        if (codeEl) {
          navigator.clipboard.writeText(codeEl.innerText).then(() => {
            const original = e.target.textContent;
            e.target.textContent = 'Copiado!';
            setTimeout(() => {
              e.target.textContent = original;
            }, 2000);
          });
        }
      }
    });

    // Exportar conversa
    btnExport.addEventListener('click', exportConversation);

    // Modal Nova Conversa
    btnNewChat.addEventListener('click', function () {
      if (modalNewChat && typeof modalNewChat.showModal === 'function') {
        modalNewChat.showModal();
      } else {
        if (confirm('Deseja realmente apagar o histórico e iniciar uma nova conversa?')) {
          resetChat();
        }
      }
    });

    if (modalBtnCancel) {
      modalBtnCancel.addEventListener('click', function () {
        modalNewChat.close();
      });
    }

    if (modalBtnConfirm) {
      modalBtnConfirm.addEventListener('click', function () {
        modalNewChat.close();
        resetChat();
      });
    }
  }

  function resetChat() {
    if (activeAbortController) {
      activeAbortController.abort();
    }
    messages = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    renderAllMessages();
    if (starterChips) starterChips.style.display = 'flex';
    chatTextarea.value = '';
    updateCharCounter();
    autoResizeTextarea();
    chatTextarea.focus();
  }

  // ============================================================================
  // INICIALIZAÇÃO
  // ============================================================================

  document.addEventListener('DOMContentLoaded', function () {
    setupMarkdown();
    loadHistory();
    setupEventListeners();
    updateCharCounter();
  });
})();
