const CHAT_API      = '/api/chat';   // same-origin passthrough (see /api/chat.js)
const LIMIT_KEY     = 'celestial_prompt_limit';
const STORAGE_KEY   = 'celestial_chat_sessions';
const LIMIT_TS_KEY  = 'celestial_prompt_ts';
const LEGAL_KEY     = 'celestial_legal_agreed';
const MODEL_KEY     = 'celestial_model';          
const RESET_MS      = 3 * 60 * 60 * 1000;         
const MAX_PROMPTS   = 45;
let sessions        = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let currentSessionId = null;
let attachedImages  = [];
let screenStream    = null;
let screenVideo     = null;
let screenCanvas    = null;
let screenInterval  = null;
let ssPopupWin      = null;
let isStreaming     = false;
let flashcards      = [];
let fcIndex         = 0;
let fcFlipped       = false;
let currentFcMsgId  = null;
let quizQuestions   = [];
let quizIndex       = 0;
let quizScore       = 0;
let quizAnswered    = false;
let currentQuizMsgId = null;
let quizEditable    = false;
let pendingQuizSubject = '';
let pendingQuizType    = '';
marked.setOptions({ breaks: true });
function getPromptCount() {
  return parseInt(localStorage.getItem(LIMIT_KEY) || '0', 10);
}
function setPromptCount(n) {
  localStorage.setItem(LIMIT_KEY, String(n));
  updateCounter();
}
function promptsLeft() {
  return Math.max(0, MAX_PROMPTS - getPromptCount());
}
function updateCounter() {
  document.getElementById('prompt-counter').textContent = promptsLeft() + ' prompts left';
}
function usePrompts(n) {
  const total = getPromptCount() + n;
  setPromptCount(total);
  if (total >= MAX_PROMPTS) {
    showToast('You reached the limit, please wait 3 hours.');
    return false;
  }
  return true;
}
function checkLimit(n) {
  if (getPromptCount() + n > MAX_PROMPTS) {
    const resetAt = new Date(Date.now() + 10800000).toLocaleTimeString();
    showToast('You reached the limit, please wait until ' + resetAt + ' to prompt again.');
    return false;
  }
  return true;
}
function switchLegalTab(tab) {
  document.getElementById('legal-tos').style.display = tab === 'tos' ? '' : 'none';
  document.getElementById('legal-pp').style.display  = tab === 'pp'  ? '' : 'none';
  document.querySelectorAll('.legal-tab').forEach((el, i) => {
    el.classList.toggle('active', (tab === 'tos' && i === 0) || (tab === 'pp' && i === 1));
  });
}
function agreeToLegal() {
  localStorage.setItem(LEGAL_KEY, '1');
  document.getElementById('legal-overlay').style.display = 'none';
}
function checkLegal() {
  const agreed = localStorage.getItem(LEGAL_KEY);
  document.getElementById('legal-overlay').style.display = agreed ? 'none' : 'flex';
}
function getSession(id) {
  return sessions.find(s => s.id === id);
}
function saveSession(session) {
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.unshift(session);
  const lean = sessions.map(s => ({
    ...s,
    messages: s.messages.map(m => ({ ...m, images: [] }))
  }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lean));
  } catch (e) {
    if (sessions.length > 1) {
      sessions = sessions.slice(0, Math.floor(sessions.length / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  }
  renderHistory();
}
function newChat() {
  currentSessionId = 'sess_' + Date.now();
  const session = {
    id:           currentSessionId,
    title:        'New conversation',
    messages:     [],
    model:        getModel(),
    systemPrompt: getSystemPrompt(),
    created:      Date.now()
  };
  sessions.unshift(session);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  renderHistory();
  renderMessages([]);
  document.getElementById('chat-title').textContent = 'New conversation';
  attachedImages = [];
  renderAttachPreview();
}
function loadSession(id) {
  currentSessionId = id;
  const session = getSession(id);
  if (!session) return;
  document.getElementById('chat-title').textContent     = session.title;
  const sel = document.getElementById('model-select');
  const savedModel = session.model || localStorage.getItem(MODEL_KEY);
  if (savedModel) {
    const exists = Array.from(sel.options).some(o => o.value === savedModel);
    if (exists) {
      sel.value = savedModel;
      localStorage.setItem(MODEL_KEY, savedModel); 
    }
  }
  renderMessages(session.messages);
  renderHistory();
}
function deleteSession(id) {
  sessions = sessions.filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  if (currentSessionId === id) newChat();
  else renderHistory();
}
function clearHistory() {
  sessions = [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  newChat();
}
function getModel() {
  return document.getElementById('model-select').value;
}
function getSystemPrompt() {
  return document.getElementById('system-prompt').value.trim();
}
function renderHistory() {
  const wrap = document.getElementById('history-wrap');
  if (!sessions.length) {
    wrap.innerHTML = '<div style="padding:12px 10px;font-size:12px;color:var(--color);opacity:0.4">No history yet</div>';
    return;
  }
  wrap.innerHTML = sessions.map(session => {
    const badge = session.cardType
      ? '<span class="history-badge">' + (session.cardType === 'flashcard' ? '🃏' : '📝') + '</span>'
      : '';
    const activeClass = session.id === currentSessionId ? ' active' : '';
    return `<div class="history-item${activeClass}" onclick="loadSession('${session.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="history-title">${escHtml(session.title)}</span>
        ${badge}
        <span class="history-del" onclick="event.stopPropagation();deleteSession('${session.id}')">✕</span>
      </div>`;
  }).join('');
}
function renderMessages(msgs) {
  const el = document.getElementById('messages');
  if (!msgs.length) {
    el.innerHTML = `<div id="empty-state">
      <div class="ehead">hey, i'm celestial AI.</div>
      <div class="esub">celestial AI can help with homework, studying, and more.</div>
      <div class="suggestion-chips">
        <span class="chip" onclick="sendSuggestion('explain quadratic equations simply')">Explain quadratic equations</span>
        <span class="chip" onclick="sendSuggestion('write a Python web scraper')">Write a Python scraper</span>
        <span class="chip" onclick="sendSuggestion('write an essay on the cold war simply')">Write an essay on the cold war</span>
        <span class="chip" onclick="sendSuggestion('how does photosynthesis happen?')">Explain photosynthesis</span>
      </div>
    </div>`;
    return;
  }
  el.innerHTML     = msgs.map(m => buildMsgHTML(m)).join('');
  el.scrollTop     = el.scrollHeight;
  attachCodeCopyBtns(el);
}
function buildMsgHTML(msg) {
  const isUser = msg.role === 'user';
  const avatar = isUser
    ? '<div class="avatar user-av">U</div>'
    : '<div class="avatar ai-av">AI</div>';
  let body = '';
  if (isUser) {
    if (msg.images && msg.images.length) {
      body += msg.images.map(src => `<img class="img-preview" src="${src}" alt=""/>`).join('');
    }
    body += '<p>' + escHtml(msg.content) + '</p>';
  } else if (msg.cardData) {
    const isQuiz  = msg.cardData[0] && msg.cardData[0].answer !== undefined;
    const btnText = isQuiz ? 'Open Quiz' : 'Open Flashcards';
    const icon    = isQuiz ? '📝' : '🃏';
    body = `<p>Done! ${icon}</p><button class="open-cards-btn" onclick="openCardsFromMsg('${msg.id}')">${btnText}</button>`;
  } else {
    body = marked.parse(msg.content || '');
  }
  const timeStr  = msg.ts ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const copyBtn  = !isUser
    ? `<button class="msg-copy-btn" onclick="copyMsg(this)" data-text="${escHtml(msg.content || '')}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy
      </button>`
    : '';
  return `<div class="msg-row ${msg.role}" id="msg-${msg.id}">
    ${isUser ? '' : avatar}
    <div>
      <div class="bubble">
        ${body}
      </div>
      <div class="bubble-meta">${timeStr}${copyBtn}</div>
    </div>
    ${isUser ? avatar : ''}
  </div>`;
}
function attachCodeCopyBtns(root) {
  root.querySelectorAll('pre code').forEach(codeEl => {
    hljs.highlightElement(codeEl);
    const pre = codeEl.parentElement;
    if (pre.querySelector('.code-copy-btn')) return;
    const btn = document.createElement('button');
    btn.className   = 'code-copy-btn';
    btn.textContent = 'Copy';
    btn.onclick = () => {
      navigator.clipboard.writeText(codeEl.innerText);
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    };
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}
function appendMsg(msg) {
  const container = document.getElementById('messages');
  const typingRow = document.getElementById('typing-row');
  if (typingRow) typingRow.remove();
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildMsgHTML(msg);
  const node = wrapper.firstElementChild;
  container.appendChild(node);
  container.scrollTop = container.scrollHeight;
  attachCodeCopyBtns(node);
}
function appendTyping() {
  const container = document.getElementById('messages');
  const row = document.createElement('div');
  row.className = 'msg-row assistant';
  row.id        = 'typing-row';
  row.innerHTML = `<div class="avatar ai-av">AI</div>
    <div>
      <div class="bubble">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}
function removeTyping() {
  const row = document.getElementById('typing-row');
  if (row) row.remove();
}
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function copyMsg(btn) {
  navigator.clipboard.writeText(btn.dataset.text);
  btn.textContent = 'Copied!';
  setTimeout(() => {
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/></svg> Copy`;
  }, 1500);
}
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  document.getElementById('send-btn').disabled =
    !textarea.value.trim() && !attachedImages.length;
}
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}
function sendSuggestion(text) {
  document.getElementById('msg-input').value = text;
  sendMessage();
}
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => (el.style.opacity = '0'), 2800);
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
async function generateTitle(session, firstMsg) {
  try {
    const res  = await fetch(CHAT_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:      getModel(),
        messages:   [{ role: 'user', content: 'Summarize this message in 4 words or less, no punctuation: "' + firstMsg + '"' }],
        max_tokens: 20
      })
    });
    const data  = await res.json();
    const title = data.choices?.[0]?.message?.content || data.content?.[0]?.text || firstMsg.slice(0, 30);
    session.title = title.trim();
  } catch {
    session.title = firstMsg.slice(0, 30);
  }
  saveSession(session);
  document.getElementById('chat-title').textContent = session.title;
  renderHistory();
}
function parseCards(raw) {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr;
  } catch {
    return null;
  }
}
function openCardsFromMsg(msgId) {
  const session = getSession(currentSessionId);
  if (!session) return;
  const msg = session.messages.find(m => m.id === msgId);
  if (!msg || !msg.cardData) return;
  const isQuiz = msg.cardData[0] && msg.cardData[0].answer !== undefined;
  isQuiz ? launchQuiz(msg.cardData, msgId, true) : launchFlashcards(msg.cardData, msgId);
}
function openCardsFromHistory() {
  const session = getSession(currentSessionId);
  if (!session || !session.messages.length) {
    showToast('Ask me to make flashcards or a quiz first');
    return;
  }
  const msg = [...session.messages].reverse().find(m => m.role === 'assistant' && m.cardData);
  if (!msg) {
    showToast('No cards found in this chat');
    return;
  }
  openCardsFromMsg(msg.id);
}
async function sendMessage() {
  const input   = document.getElementById('msg-input');
  const text    = input.value.trim();
  if ((!text && !attachedImages.length) || isStreaming) return;
  if (getPromptCount() >= MAX_PROMPTS) {
    showToast('You reached the limit, please wait 3 hours.');
    return;
  }
  const promptCost = attachedImages.length ? 5 : 1;
  if (!currentSessionId) newChat();
  const session = getSession(currentSessionId);
  if (!session) return;
  const wantsQuiz      = /\bquiz\b|test me|make.*quiz/i.test(text);
  const wantsFlashcard = /flashcard|flash card/i.test(text);
  if (wantsQuiz) {
    pendingQuizSubject = text;
    const hasContext = session.messages.length > 2;
    const ctxBtn = document.getElementById('quiz-context-btn');
    ctxBtn.style.opacity       = hasContext ? '1' : '0';
    ctxBtn.style.pointerEvents = hasContext ? 'auto' : 'none';
    document.getElementById('quiz-type-overlay').classList.add('open');
    return;
  }
  const userMsg = {
    id:     'u_' + Date.now(),
    role:   'user',
    content: text,
    images: [...attachedImages],
    ts:     Date.now()
  };
  session.messages.push(userMsg);
  if (session.title === 'New conversation' && text) generateTitle(session, text);
  saveSession(session);
  appendMsg(userMsg);
  input.value             = '';
  input.style.height      = 'auto';
  attachedImages          = [];
  renderAttachPreview();
  document.getElementById('send-btn').disabled = true;
  appendTyping();
  isStreaming = true;
  usePrompts(promptCost);
  const systemPromptText = getSystemPrompt();
  const apiMessages = [];
  if (wantsFlashcard) {
    const isTemplate = /template/i.test(text);
    apiMessages.push({
      role:    'system',
      content: isTemplate
        ? 'Respond ONLY with a valid JSON array of flashcard objects with "q" and "a" keys. Create a template with 3 example cards showing the format. No markdown, no backticks, no explanation. Start directly with [.'
        : 'Respond ONLY with a valid JSON array of flashcard objects. Each must have "q" (question) and "a" (answer) as strings. No other text, no markdown, no backticks. Start directly with [.'
    });
  } else if (systemPromptText) {
    apiMessages.push({ role: 'system', content: systemPromptText });
  }
  session.messages.slice(0, -1).forEach(m => {
    if (!m.cardData) apiMessages.push({ role: m.role, content: m.content });
  });
  const msgContent = userMsg.images.length
    ? [
        ...userMsg.images.map(src => ({ type: 'image_url', image_url: { url: src } })),
        { type: 'text', text: text || 'What is in this image?' }
      ]
    : text;
  apiMessages.push({ role: 'user', content: msgContent });
  const aiMsgId = 'a_' + Date.now();
  try {
    const res = await fetch(CHAT_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: getModel(), messages: apiMessages, temperature: 0.8, max_tokens: 2048 })
    });
    removeTyping();
    if (res.status === 429) {
      showToast('You reached the limit, please wait 3 hours.');
      isStreaming = false;
      document.getElementById('send-btn').disabled = false;
      return;
    }
    if (!res.ok) throw new Error('API error ' + res.status);
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content || data.content?.[0]?.text || JSON.stringify(data);
    if (wantsFlashcard) {
      const cards = parseCards(content);
      if (cards) {
        const aiMsg = { id: aiMsgId, role: 'assistant', content: '<p>Done! 🃏</p>', cardData: cards, cardType: 'flashcard', ts: Date.now() };
        session.messages.push(aiMsg);
        session.cardType = 'flashcard';
        saveSession(session);
        appendMsg(aiMsg);
        launchFlashcards(cards, aiMsgId);
      } else {
        const errMsg = { id: aiMsgId, role: 'assistant', content: 'Sorry, I had trouble generating the cards. Please try again.', ts: Date.now() };
        session.messages.push(errMsg);
        saveSession(session);
        appendMsg(errMsg);
      }
    } else {
      const aiMsg = { id: aiMsgId, role: 'assistant', content, ts: Date.now() };
      session.messages.push(aiMsg);
      saveSession(session);
      appendMsg(aiMsg);
    }
  } catch (err) {
    removeTyping();
    const errMsg = { id: aiMsgId, role: 'assistant', content: '**Error:** ' + err.message, ts: Date.now() };
    const s = getSession(currentSessionId);
    if (s) { s.messages.push(errMsg); saveSession(s); }
    appendMsg(errMsg);
  } finally {
    isStreaming = false;
    document.getElementById('send-btn').disabled = false;
  }
}
function cancelQuizType() {
  document.getElementById('quiz-type-overlay').classList.remove('open');
  pendingQuizSubject = '';
}
async function pickQuizType(type) {
  document.getElementById('quiz-type-overlay').classList.remove('open');
  const session = getSession(currentSessionId);
  if (!session) return;
  const QUIZ_SYSTEM = 'Respond ONLY with a valid JSON array. Each item must have exactly: "q" (question string), "options" (array of exactly 4 strings), "answer" (integer index 0-3 of correct option). No other text, no markdown, no backticks. Start directly with [.';
  const isCustom = type === 'custom';
  let userContent = '';
  if (type === 'context') {
    userContent = 'Generate a 5-question quiz about: ' + pendingQuizSubject;
  } else if (type === 'chat') {
    const history = session.messages
      .filter(m => !m.cardData)
      .slice(-10)
      .map(m => m.role + ': ' + m.content)
      .join('\n');
    userContent = 'Generate a 5-question quiz based on this conversation:\n' + history;
  } else if (type === 'custom') {
    const customText = document.getElementById('quiz-type-custom-input').value.trim();
    if (!customText) {
      showToast('Please describe your quiz first');
      document.getElementById('quiz-type-overlay').classList.add('open');
      return;
    }
    userContent = customText;
  }
  const userMsg = { id: 'u_' + Date.now(), role: 'user', content: pendingQuizSubject, images: [], ts: Date.now() };
  session.messages.push(userMsg);
  if (session.title === 'New conversation') generateTitle(session, pendingQuizSubject);
  saveSession(session);
  appendMsg(userMsg);
  appendTyping();
  isStreaming = true;
  const aiMsgId = 'a_' + Date.now();
  try {
    const res = await fetch(CHAT_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:      getModel(),
        messages:   [{ role: 'system', content: QUIZ_SYSTEM }, { role: 'user', content: userContent }],
        temperature: 0.8,
        max_tokens:  2048
      })
    });
    removeTyping();
    if (!res.ok) throw new Error('API error ' + res.status);
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content || data.content?.[0]?.text || '';
    const cards   = parseCards(content);
    if (cards) {
      const aiMsg = { id: aiMsgId, role: 'assistant', content: '<p>Done! 📝</p>', cardData: cards, cardType: 'quiz', ts: Date.now() };
      session.messages.push(aiMsg);
      session.cardType = 'quiz';
      saveSession(session);
      appendMsg(aiMsg);
      launchQuiz(cards, aiMsgId, isCustom);
    } else {
      const errMsg = { id: aiMsgId, role: 'assistant', content: 'Sorry, I had trouble generating the quiz. Please try again.', ts: Date.now() };
      session.messages.push(errMsg);
      saveSession(session);
      appendMsg(errMsg);
    }
  } catch (err) {
    removeTyping();
    appendMsg({ id: aiMsgId, role: 'assistant', content: '**Error:** ' + err.message, ts: Date.now() });
  } finally {
    isStreaming = false;
    document.getElementById('send-btn').disabled = false;
    pendingQuizSubject = '';
  }
}
function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader   = new FileReader();
    reader.onload  = e => {
      attachedImages.push(e.target.result);
      renderAttachPreview();
      document.getElementById('send-btn').disabled = false;
    };
    reader.readAsDataURL(file);
  });
}
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const hasImage = Array.from(e.dataTransfer.items).some(i => i.kind === 'file' && i.type.startsWith('image/'));
  if (hasImage) {
    e.dataTransfer.dropEffect = 'copy';
    document.getElementById('drop-overlay').classList.add('active');
  }
}
function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!e.currentTarget.contains(e.relatedTarget)) {
    document.getElementById('drop-overlay').classList.remove('active');
  }
}
function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('drop-overlay').classList.remove('active');
  const images = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (images.length) handleFiles(images);
}
function renderAttachPreview() {
  document.getElementById('attach-preview').innerHTML = attachedImages.map((src, i) =>
    `<div class="attach-thumb">
      <img src="${src}" alt=""/>
      <button class="rm-attach" onclick="removeAttach(${i})">×</button>
    </div>`
  ).join('');
}
function removeAttach(idx) {
  attachedImages.splice(idx, 1);
  renderAttachPreview();
  const isEmpty = !document.getElementById('msg-input').value.trim();
  if (!attachedImages.length && isEmpty) document.getElementById('send-btn').disabled = true;
}
function launchFlashcards(cards, msgId) {
  flashcards     = [...cards];
  currentFcMsgId = msgId || null;
  fcIndex        = 0;
  fcFlipped      = false;
  renderFCCard();
  document.getElementById('flashcard-overlay').classList.add('open');
}
function renderFCCard() {
  const card = flashcards[fcIndex];
  document.getElementById('fc-front').textContent    = card.q;
  document.getElementById('fc-back').textContent     = card.a;
  document.getElementById('fc-progress').textContent = (fcIndex + 1) + ' / ' + flashcards.length;
  document.getElementById('fc-prev').disabled        = fcIndex === 0;
  document.getElementById('fc-next').disabled        = fcIndex === flashcards.length - 1;
  document.getElementById('fc-edit-q').value         = card.q;
  document.getElementById('fc-edit-a').value         = card.a;
  document.getElementById('fc-card-inner').classList.remove('flipped');
  fcFlipped = false;
}
function flipCard() {
  fcFlipped = !fcFlipped;
  document.getElementById('fc-card-inner').classList.toggle('flipped', fcFlipped);
}
function fcNav(dir) {
  fcIndex = Math.max(0, Math.min(flashcards.length - 1, fcIndex + dir));
  renderFCCard();
}
function fcSaveEdit() {
  const q = document.getElementById('fc-edit-q').value.trim();
  const a = document.getElementById('fc-edit-a').value.trim();
  if (!q || !a) { showToast('Both fields required'); return; }
  flashcards[fcIndex] = { q, a };
  renderFCCard();
  persistCardEdit();
  showToast('Saved!');
}
function fcAddCard() {
  flashcards.push({ q: 'New Question', a: 'New Answer' });
  fcIndex = flashcards.length - 1;
  renderFCCard();
  persistCardEdit();
}
function fcDeleteCard() {
  if (flashcards.length <= 1) { showToast('Cannot delete last card'); return; }
  flashcards.splice(fcIndex, 1);
  fcIndex = Math.max(0, fcIndex - 1);
  renderFCCard();
  persistCardEdit();
}
function persistCardEdit() {
  if (!currentFcMsgId) return;
  const session = getSession(currentSessionId);
  if (!session) return;
  const msg = session.messages.find(m => m.id === currentFcMsgId);
  if (msg) msg.cardData = [...flashcards];
  saveSession(session);
}
function closeFlashcards() {
  document.getElementById('flashcard-overlay').classList.remove('open');
}
function launchQuiz(questions, msgId, editable) {
  quizQuestions  = [...questions];
  currentQuizMsgId = msgId || null;
  quizEditable   = !!editable;
  quizIndex      = 0;
  quizScore      = 0;
  quizAnswered   = false;
  document.getElementById('quiz-customize-bar').style.display = quizEditable ? 'flex' : 'none';
  document.getElementById('quiz-result').style.display        = 'none';
  document.getElementById('quiz-question').style.display      = '';
  document.getElementById('quiz-options').style.display       = '';
  document.getElementById('quiz-feedback').style.display      = '';
  document.getElementById('quiz-next-btn').style.display      = 'none';
  renderQuizQuestion();
  document.getElementById('quiz-overlay').classList.add('open');
}
function renderQuizQuestion() {
  const q = quizQuestions[quizIndex];
  document.getElementById('quiz-progress').textContent    = 'Question ' + (quizIndex + 1) + ' / ' + quizQuestions.length;
  document.getElementById('quiz-score-display').textContent = 'Score: ' + quizScore;
  document.getElementById('quiz-question').textContent    = q.q;
  document.getElementById('quiz-feedback').textContent    = '';
  document.getElementById('quiz-next-btn').style.display  = 'none';
  if (quizEditable) document.getElementById('quiz-edit-q').value = q.q;
  quizAnswered = false;
  document.getElementById('quiz-options').innerHTML = q.options.map((opt, i) =>
    `<button class="quiz-option" onclick="answerQuiz(${i})">${escHtml(opt)}</button>`
  ).join('');
}
function answerQuiz(chosen) {
  if (quizAnswered) return;
  quizAnswered = true;
  const q       = quizQuestions[quizIndex];
  const correct = parseInt(q.answer, 10);
  const btns    = document.querySelectorAll('.quiz-option');
  btns.forEach(b => (b.disabled = true));
  if (chosen === correct) {
    btns[chosen].classList.add('correct');
    document.getElementById('quiz-feedback').textContent = '✓ Correct!';
    quizScore++;
  } else {
    btns[chosen].classList.add('wrong');
    btns[correct].classList.add('correct');
    document.getElementById('quiz-feedback').textContent = '✗ Correct answer: ' + q.options[correct];
  }
  document.getElementById('quiz-score-display').textContent = 'Score: ' + quizScore;
  const nextBtn = document.getElementById('quiz-next-btn');
  nextBtn.style.display = 'block';
  nextBtn.textContent   = quizIndex === quizQuestions.length - 1 ? 'See Results' : 'Next →';
}
function quizNext() {
  quizIndex++;
  if (quizIndex >= quizQuestions.length) {
    document.getElementById('quiz-question').style.display  = 'none';
    document.getElementById('quiz-options').style.display   = 'none';
    document.getElementById('quiz-feedback').style.display  = 'none';
    document.getElementById('quiz-next-btn').style.display  = 'none';
    const pct = Math.round(quizScore / quizQuestions.length * 100);
    document.getElementById('quiz-final-score').textContent = quizScore + ' / ' + quizQuestions.length;
    document.getElementById('quiz-final-label').textContent = pct >= 80 ? 'Great job! 🎉' : pct >= 50 ? 'Good effort!' : 'Keep practicing!';
    document.getElementById('quiz-result').style.display   = 'flex';
  } else {
    renderQuizQuestion();
  }
}
function quizRestart() {
  quizIndex    = 0;
  quizScore    = 0;
  quizAnswered = false;
  document.getElementById('quiz-result').style.display   = 'none';
  document.getElementById('quiz-question').style.display = '';
  document.getElementById('quiz-options').style.display  = '';
  document.getElementById('quiz-feedback').style.display = '';
  renderQuizQuestion();
}
function quizSaveEdit() {
  if (!quizEditable) return;
  const q = document.getElementById('quiz-edit-q').value.trim();
  if (!q) { showToast('Question required'); return; }
  quizQuestions[quizIndex].q = q;
  renderQuizQuestion();
  persistQuizEdit();
  showToast('Saved!');
}
function quizDeleteQ() {
  if (!quizEditable) return;
  if (quizQuestions.length <= 1) { showToast('Cannot delete last question'); return; }
  quizQuestions.splice(quizIndex, 1);
  quizIndex = Math.max(0, quizIndex - 1);
  renderQuizQuestion();
  persistQuizEdit();
}
function quizAddQ() {
  if (!quizEditable) return;
  quizQuestions.push({ q: 'New Question', options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 0 });
  quizIndex = quizQuestions.length - 1;
  renderQuizQuestion();
  persistQuizEdit();
}
function persistQuizEdit() {
  if (!currentQuizMsgId) return;
  const session = getSession(currentSessionId);
  if (!session) return;
  const msg = session.messages.find(m => m.id === currentQuizMsgId);
  if (msg) msg.cardData = [...quizQuestions];
  saveSession(session);
}
function closeQuiz() {
  document.getElementById('quiz-overlay').classList.remove('open');
}
async function toggleScreenShare() {
  screenStream ? stopScreenShare(false) : await startScreenShare();
}
async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    screenVideo  = document.createElement('video');
    screenVideo.srcObject = screenStream;
    screenVideo.play();
    screenCanvas = document.createElement('canvas');
    screenVideo.addEventListener('loadedmetadata', () => {
      screenCanvas.width  = screenVideo.videoWidth;
      screenCanvas.height = screenVideo.videoHeight;
    });
    screenInterval = setInterval(() => {
      if (screenCanvas && screenVideo.readyState >= 2 && screenCanvas.width > 0) {
        screenCanvas.getContext('2d').drawImage(screenVideo, 0, 0, screenCanvas.width, screenCanvas.height);
        if (ssPopupWin && !ssPopupWin.closed) {
          const ssCanvasEl = ssPopupWin.document.getElementById('ss-canvas');
          if (ssCanvasEl) {
            if (ssCanvasEl.width !== screenCanvas.width) {
              ssCanvasEl.width  = screenCanvas.width;
              ssCanvasEl.height = screenCanvas.height;
            }
            ssCanvasEl.getContext('2d').drawImage(screenCanvas, 0, 0);
          }
        }
      }
    }, 200);
    screenStream.getVideoTracks()[0].addEventListener('ended', () => stopScreenShare(false));
    openSsWindow();
    document.getElementById('ss-toggle-btn').classList.add('active');
  } catch {
    showToast('Screen share cancelled');
  }
}
function openSsWindow() {
  const w = 480, h = 520;
  const left = Math.max(0, screen.availWidth  - w - 20);
  const top  = Math.max(0, screen.availHeight - h - 60);
  ssPopupWin = window.open(
    'about:blank', 'ss_win',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no`
  );
  if (!ssPopupWin) { showToast('Allow popups to use screen share'); return; }
  const models    = ['gpt-5.4-mini', 'gpt-5.4', 'claude-sonnet-4.6', 'gemini-3-flash-preview'];
  const curModel  = getModel();
  const optionsHtml = models.map(m =>
    `<option value="${m}"${m === curModel ? ' selected' : ''}>${m}</option>`
  ).join('');
  ssPopupWin.document.write(SS_POPUP_HTML(optionsHtml));
  ssPopupWin.document.close();
}
function SS_POPUP_HTML(optionsHtml) {
  return `<!DOCTYPE html>
<html>
<title>Screen Share</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #111; color: #fff; font-family: 'Inter', system-ui, sans-serif; font-size: 13px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
#bar { background: #1a1a1a; border-bottom: 1px solid rgba(255,255,255,.15); padding: 8px 12px; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
#dot { width: 8px; height: 8px; border-radius: 50%; background: #e05c5c; animation: p 1.5s ease-in-out infinite; flex-shrink: 0; }
@keyframes p { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
#bar-label { flex: 1; font-size: 12px; font-weight: 600; opacity: .6; letter-spacing: .04em; }
#stop { background: rgba(224,92,92,.15); border: 1px solid #e05c5c; color: #e05c5c; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; font-family: 'Inter', system-ui, sans-serif; }
#stop:hover { background: rgba(224,92,92,.3); }
#preview { flex: 0 0 200px; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; }
#ss-canvas { max-width: 100%; max-height: 100%; display: block; }
#chat-area { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
#chat-area::-webkit-scrollbar { width: 3px; }
#chat-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 2px; }
.ss-msg { padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.5; max-width: 90%; }
.ss-msg.user { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.2); align-self: flex-end; }
.ss-msg.ai { background: #1e1e1e; border: 1px solid rgba(255,255,255,.1); align-self: flex-start; }
.ss-msg.typing { opacity: .5; }
#bottom { padding: 10px; border-top: 1px solid rgba(255,255,255,.12); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
#inp { width: 100%; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.22); color: #fff; border-radius: 7px; padding: 9px 12px; font-size: 13px; font-family: 'Inter', system-ui, sans-serif; outline: none; }
#inp:focus { border-color: #fff; }
#inp::placeholder { color: rgba(255,255,255,.3); }
#row { display: flex; gap: 8px; align-items: center; }
#msel { flex: 1; background: #3a3a3a; border: 1px solid rgba(255,255,255,.22); color: #fff; border-radius: 6px; padding: 6px 8px; font-size: 12px; font-family: 'Inter', system-ui, sans-serif; cursor: pointer; outline: none; }
#hint { font-size: 11px; opacity: .28; white-space: nowrap; }
</style>
<div id="bar"><div id="dot"></div><span id="bar-label">Screen Share</span><button id="stop" onclick="window.opener&&window.opener.stopScreenShare(true);window.close()">Stop Sharing</button></div>
<div id="preview"><canvas id="ss-canvas" width="1" height="1"></canvas></div>
<div id="chat-area"></div>
<div id="bottom">
  <input id="inp" type="text" placeholder="Ask about what's on your screen..."/>
  <div id="row"><select id="msel">${optionsHtml}</select><span id="hint">Enter to ask</span></div>
</div>
<script>
var chatArea = document.getElementById('chat-area');
function addMsg(text, role) {
  var d = document.createElement('div');
  d.className = 'ss-msg ' + role;
  d.textContent = text;
  chatArea.appendChild(d);
  chatArea.scrollTop = chatArea.scrollHeight;
  return d;
}
document.getElementById('inp').focus();
document.getElementById('inp').addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  var t = this.value.trim();
  if (!t) return;
  this.value = '';
  addMsg(t, 'user');
  var typing = addMsg('...', 'ai typing');
  var m = document.getElementById('msel').value;
  if (window.opener && !window.opener.closed) {
    window.opener.sendScreenQuestion(t, m, function(reply) {
      typing.className = 'ss-msg ai';
      typing.textContent = reply;
      chatArea.scrollTop = chatArea.scrollHeight;
    });
  }
});
window.addEventListener('beforeunload', function() {
  if (window.opener && !window.opener.closed) window.opener.stopScreenShare(true);
});
<\/script>
</html>`;
}
function stopScreenShare(closePopup) {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  clearInterval(screenInterval);
  screenCanvas = null;
  if (!closePopup && ssPopupWin && !ssPopupWin.closed) ssPopupWin.close();
  ssPopupWin = null;
  document.getElementById('ss-toggle-btn').classList.remove('active');
}
async function sendScreenQuestion(text, model, callback) {
  if (!text || !screenCanvas) return;
  const imageData = screenCanvas.toDataURL('image/jpeg', 0.7);
  if (!currentSessionId) newChat();
  const session = getSession(currentSessionId);
  if (!session) return;
  const userMsg = { id: 'u_' + Date.now(), role: 'user', content: '[Screen] ' + text, images: [imageData], ts: Date.now() };
  session.messages.push(userMsg);
  saveSession(session);
  appendMsg(userMsg);
  appendTyping();
  isStreaming = true;
  const aiMsgId = 'a_' + Date.now();
  try {
    const res = await fetch(CHAT_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:      model || getModel(),
        messages:   [{ role: 'user', content: [{ type: 'image_url', image_url: { url: imageData } }, { type: 'text', text }] }],
        max_tokens: 1024
      })
    });
    removeTyping();
    if (!res.ok) throw new Error('API error ' + res.status);
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content || data.content?.[0]?.text || JSON.stringify(data);
    const aiMsg   = { id: aiMsgId, role: 'assistant', content, ts: Date.now() };
    session.messages.push(aiMsg);
    saveSession(session);
    appendMsg(aiMsg);
    if (callback) callback(content);
  } catch (err) {
    removeTyping();
    const errText = 'Error: ' + err.message;
    appendMsg({ id: aiMsgId, role: 'assistant', content: '**' + errText + '**', ts: Date.now() });
    if (callback) callback(errText);
  } finally {
    isStreaming = false;
    document.getElementById('send-btn').disabled = false;
  }
}
(function initModelPersistence() {
  const sel = document.getElementById('model-select');
  if (!sel) return;
  const saved = localStorage.getItem(MODEL_KEY);
  if (saved) {
    const exists = Array.from(sel.options).some(o => o.value === saved);
    if (exists) sel.value = saved;
  }
  sel.addEventListener('change', function () {
    localStorage.setItem(MODEL_KEY, this.value);
    if (currentSessionId) {
      const session = getSession(currentSessionId);
      if (session) {
        session.model = this.value;
        saveSession(session);
      }
    }
  });
})();
document.getElementById('msg-input').addEventListener('input', function () {
  document.getElementById('send-btn').disabled = !this.value.trim() && !attachedImages.length;
});
checkLegal();
updateCounter();
renderHistory();
if (sessions.length) loadSession(sessions[0].id);
else newChat();
const dropZone = document.getElementById('chat-container') || document.body;
dropZone.addEventListener('dragover',   handleDragOver);
dropZone.addEventListener('dragleave',  handleDragLeave);
dropZone.addEventListener('drop',       handleDrop);