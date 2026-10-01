'use strict';

const $ = (id) => document.getElementById(id);
let busy = false;
let state = null;

/* ------------------------------- helpers ------------------------------- */

async function jsonFetch(url, options) {
  const resp = await fetch(url, options);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || data.errors?.join('; ') || `HTTP ${resp.status}`);
  return data;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderRich(text) {
  // fenced code blocks first, then inline code, escaping everything else
  const parts = [];
  let rest = text;
  const fence = /```([A-Za-z0-9_+-]*)\r?\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = fence.exec(text)) !== null) {
    parts.push(escapeHtml(text.slice(last, m.index)));
    parts.push(`<pre><code>${escapeHtml(m[2].replace(/\n$/, ''))}</code></pre>`);
    last = m.index + m[0].length;
    rest = text.slice(last);
  }
  parts.push(escapeHtml(rest));
  return parts.join('')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

async function streamBody(url, options, onChunk) {
  const resp = await fetch(url, options);
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try { detail = (await resp.json()).error || detail; } catch (e) { /* ignore */ }
    throw new Error(detail);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    if (onChunk) onChunk(chunk);
  }
  return full;
}

function setBusy(value) {
  busy = value;
  $('job-badge').hidden = !value;
  document.querySelectorAll('button, a.btn').forEach((el) => {
    if (el.id === 'clear-chat') return;
    if (value) el.setAttribute('data-disabled', '1'), el.disabled = true;
    else if (el.getAttribute('data-disabled')) { el.disabled = false; el.removeAttribute('data-disabled'); }
  });
}

/* ------------------------------ state render --------------------------- */

async function refresh() {
  state = await jsonFetch('/api/state');
  render();
}

function render() {
  const w = state.wizard;
  const summary = state;

  $('models').textContent = w.models.providers;
  $('reader-link').hidden = !summary.assembled;

  $('question').textContent = w.question;
  const buttons = $('wizard-buttons');
  buttons.innerHTML = '';
  $('blog-box').hidden = true;
  $('gap-block').hidden = true;
  $('assemble-actions').hidden = true;
  $('done-actions').hidden = true;
  $('gap-actions').innerHTML = '';
  $('chat-hint').textContent = '';

  const answer = (question, value, label) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => postWizard(question, value);
    buttons.appendChild(b);
  };

  switch (w.phase) {
    case 'q_draft':
      answer('draft', true, 'Yes — I have draft.json');
      answer('draft', false, 'No — start from a blog');
      break;

    case 'draft_found':
      $('gap-block').hidden = false;
      renderGap();
      answer('draft', true, 'Yes — use this draft');
      answer('draft', false, 'No — start from a blog');
      break;

    case 'draft_fix':
      if (w.blog.exists) {
        const b = document.createElement('button');
        b.className = 'primary';
        b.textContent = 'Recreate draft from input/blog.txt';
        b.onclick = () => runAction('create_draft');
        buttons.appendChild(b);
      }
      break;

    case 'blog':
      $('blog-box').hidden = false;
      if (w.blog.exists) $('chat-hint').textContent = 'input/blog.txt already exists';
      break;

    case 'q_images':
    case 'q_audio':
    case 'q_js': {
      const kind = w.phase.slice(2);           // images | audio | js
      const totals = w.totals[kind] || '0/0';
      const note = document.createElement('span');
      note.className = 'muted';
      note.textContent = `on disk: ${totals}   `;
      buttons.appendChild(note);
      answer(kind, true, 'Yes — already created');
      answer(kind, false, 'No');
      break;
    }

    case 'gap':
      $('gap-block').hidden = false;
      renderGap();
      if (w.missingCount > 0) {
        const b = document.createElement('button');
        b.className = 'primary';
        b.textContent = `Generate ${w.missingCount} missing asset(s)`;
        b.onclick = generateMissing;
        $('gap-actions').appendChild(b);
      }
      break;

    case 'assemble':
      $('gap-block').hidden = false;
      renderGap();
      $('assemble-actions').hidden = false;
      break;

    case 'done':
      $('gap-block').hidden = false;
      renderGap();
      $('done-actions').hidden = false;
      break;
  }
}

function renderGap() {
  const w = state.wizard;
  $('gap-totals').textContent =
    Object.entries(w.totals).map(([k, v]) => `${k} ${v}`).join(' · ');
  const table = $('gap-table');
  if (!w.draft.valid) { table.innerHTML = ''; return; }
  const kinds = ['image', 'js', 'audio'];
  table.innerHTML =
    '<tr><th>#</th><th>section</th><th>image</th><th>js</th><th>audio</th></tr>' +
    w.sections.map((s) => {
      const cell = (kind) => {
        const a = s.assets[kind];
        if (!a) return '<td class="muted">—</td>';
        return a.present
          ? `<td><span class="ok">✓</span> <span class="muted">${a.file}</span></td>`
          : `<td><span class="no">✗ missing</span></td>`;
      };
      return `<tr><td>${String(s.index).padStart(2, '0')}</td><td>${s.id}</td>` +
             kinds.map(cell).join('') + '</tr>';
    }).join('');
}

/* ------------------------------ wizard api ----------------------------- */

async function postWizard(question, value) {
  if (busy) return;
  setBusy(true);
  try {
    state = await jsonFetch('/api/wizard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, value }),
    });
    render();
  } catch (e) { logLine(`ERROR: ${e.message}`); }
  setBusy(false);
}

async function saveBlog() {
  const text = $('blog-text').value.trim();
  if (!text) return;
  setBusy(true);
  try {
    state = await jsonFetch('/api/blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    render();
    logLine('saved input/blog.txt');
  } catch (e) { logLine(`ERROR: ${e.message}`); }
  setBusy(false);
}

/* ------------------------------ run actions ---------------------------- */

function logLine(chunk) {
  const log = $('run-log');
  log.textContent += chunk;
  log.scrollTop = log.scrollHeight;
}

async function runAction(action, { clear = true } = {}) {
  if (busy) return;
  setBusy(true);
  if (clear) $('run-log').textContent = '';
  logLine(`$ ${action}\n`);
  try {
    await streamBody(`/api/run?action=${encodeURIComponent(action)}`, {}, logLine);
  } catch (e) {
    logLine(`ERROR: ${e.message}\n`);
  }
  await refresh();
  setBusy(false);
}

async function generateMissing() {
  if (busy) return;
  setBusy(true);
  $('run-log').textContent = '';
  const kinds = [
    ['image', 'ensure_images'],
    ['audio', 'ensure_audio'],
    ['js', 'ensure_js'],
  ];
  for (const [key, action] of kinds) {
    const missing = state.wizard.missing[key];
    if (!missing || !missing.length) continue;
    logLine(`\n$ ${action} (${missing.length} missing)\n`);
    try {
      await streamBody(`/api/run?action=${action}`, {}, logLine);
    } catch (e) {
      logLine(`ERROR: ${e.message}\n`);
      break;
    }
    await refresh();
    if ((state.wizard.missing[key] || []).length) {
      logLine(`(still missing ${state.wizard.missing[key].length} ${key} file(s))\n`);
      break;                     // provider/quota problem: stop, let user decide
    }
  }
  await refresh();
  setBusy(false);
}

async function archive() {
  if (!confirm('Archive input + draft + final to out/<n> and clear the workspace?')) return;
  await runAction('archive');
}

/* --------------------------------- chat -------------------------------- */

function addMessage(role, html, { streaming = false, raw = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = role === 'user' ? 'you' : 'assistant';
  const body = document.createElement('div');
  body.className = 'body';
  body.innerHTML = html;
  wrap.appendChild(meta);
  wrap.appendChild(body);
  if (raw !== null) wrap.dataset.raw = raw;
  $('messages').appendChild(wrap);
  if (!streaming) wrap.dataset.done = '1';
  $('messages').scrollTop = $('messages').scrollHeight;
  return { wrap, body };
}

function enhanceMessage(msg) {
  const text = msg.wrap.dataset.raw || msg.body.textContent;
  const actions = document.createElement('div');
  actions.className = 'post-actions';
  if (/```javascript|```js/.test(text)) {
    const b = document.createElement('button');
    b.textContent = 'ingest JS into draft/assets/js/';
    b.onclick = async () => {
      b.disabled = true;
      try {
        const data = await jsonFetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        b.textContent = `saved: ${data.result.saved.join(', ') || 'nothing'}`;
        state = data.state;
        render();
      } catch (e) {
        b.textContent = `failed: ${e.message}`;
      }
    };
    actions.appendChild(b);
  }
  if (/```json/.test(text)) {
    const b = document.createElement('button');
    b.textContent = 'save as draft.json';
    b.onclick = async () => {
      b.disabled = true;
      try {
        const data = await jsonFetch('/api/draft-ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        b.textContent = 'draft saved ✓';
        state = data.state;
        render();
      } catch (e) {
        b.textContent = `invalid: ${e.message}`;
      }
    };
    actions.appendChild(b);
  }
  if (actions.children.length) msg.wrap.appendChild(actions);
}

async function sendChat(message) {
  if (busy || !message.trim()) return;
  setBusy(true);
  const msg = addMessage('user', renderRich(message), { raw: message });
  $('chat-input').value = '';
  const reply = addMessage('assistant', '', { streaming: true });
  try {
    await streamBody('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }, (chunk) => {
      reply.body.innerHTML = renderRich(reply.body.dataset.raw = (reply.body.dataset.raw || '') + chunk);
      $('messages').scrollTop = $('messages').scrollHeight;
    });
    reply.wrap.dataset.raw = reply.body.dataset.raw || '';
    enhanceMessage(reply);
    reply.wrap.dataset.done = '1';
    await refresh();
  } catch (e) {
    reply.body.innerHTML = `<span class="no">error: ${escapeHtml(e.message)}</span>`;
  }
  setBusy(false);
  $('chat-input').focus();
}

function greet() {
  const box = $('messages');
  box.innerHTML = '';
  addMessage('assistant',
    'Ask me anything about the pipeline — paste a blog, a draft.json,\n' +
    'or JS code blocks. The wizard on the left asks the four setup\n' +
    'questions one at a time; I do the rest.');
}

async function loadHistory() {
  try {
    const data = await jsonFetch('/api/history');
    const box = $('messages');
    box.innerHTML = '';
    for (const m of data.messages) {
      addMessage(m.role, renderRich(m.content), { raw: m.content });
    }
    box.scrollTop = box.scrollHeight;
    if (!data.messages.length) greet();
  } catch (e) { /* fresh start */ }
}

/* -------------------------------- wiring ------------------------------- */

$('save-blog').onclick = saveBlog;
$('create-draft').onclick = () => {
  const text = $('blog-text').value.trim();
  if (text) return saveBlog().then(() => runAction('create_draft'));
  return runAction('create_draft');
};
$('assemble-btn').onclick = () => runAction('assemble');
$('archive-btn').onclick = archive;
$('reset-wizard').onclick = async () => {
  state = await jsonFetch('/api/wizard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset' }),
  });
  render();
};
$('clear-chat').onclick = async () => {
  await jsonFetch('/api/history', { method: 'DELETE' });
  await loadHistory();
};

$('composer').onsubmit = (event) => {
  event.preventDefault();
  sendChat($('chat-input').value);
};
$('chat-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    $('composer').requestSubmit();
  }
});

(async function init() {
  await loadHistory();
  await refresh();
})();
