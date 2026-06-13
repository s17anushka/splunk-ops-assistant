const chatLog = document.getElementById('chatLog');
const composer = document.getElementById('composer');
const input = document.getElementById('questionInput');
const askBtn = document.getElementById('askBtn');
const suggestions = document.getElementById('suggestions');
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');

const traceSteps = {
  1: document.querySelector('[data-step="1"]'),
  2: document.querySelector('[data-step="2"]'),
  3: document.querySelector('[data-step="3"]'),
};

const splOutput = document.getElementById('splOutput');
const eventsOutput = document.getElementById('eventsOutput');
const summaryPreview = document.getElementById('summaryPreview');

let history = [];

function addMessage(role, html) {
  const div = document.createElement('div');
  div.className = `msg msg-${role}`;
  div.innerHTML = html;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resetTrace() {
  Object.values(traceSteps).forEach(step => {
    step.classList.remove('active', 'done', 'error');
  });
  splOutput.textContent = '—';
  eventsOutput.textContent = '—';
  summaryPreview.textContent = '—';
}

function setStepActive(step) {
  traceSteps[step].classList.add('active');
}

function setStepDone(step) {
  traceSteps[step].classList.remove('active');
  traceSteps[step].classList.add('done');
}

function setStepError(step) {
  traceSteps[step].classList.remove('active');
  traceSteps[step].classList.add('error');
}

function severityClass(line) {
  if (/\bERROR\b/.test(line)) return 'is-error';
  if (/\bWARN\b/.test(line)) return 'is-warn';
  if (/\bINFO\b/.test(line)) return 'is-info';
  return '';
}

function renderEventsTable(events) {
  if (!events || events.length === 0) {
    return '<div class="event-row">No matching events found.</div>';
  }
  const rows = events
    .slice(0, 10)
    .map(e => {
      const raw = escapeHtml(e._raw || '');
      const cls = severityClass(raw);
      return `<div class="event-row ${cls}">${raw}</div>`;
    })
    .join('');
  const more = events.length > 10
    ? `<div class="event-row">…and ${events.length - 10} more</div>`
    : '';
  return `<div class="event-table">${rows}${more}</div>`;
}

function addToHistory(question, ok, count) {
  history.unshift({ question, ok, count });
  if (history.length > 12) history.pop();
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historyList.innerHTML = '<li class="history-empty" id="historyEmpty">No queries yet</li>';
    return;
  }
  historyList.innerHTML = history.map((h, i) => {
    const badge = h.ok
      ? `<span class="h-badge ok">✓</span>`
      : `<span class="h-badge fail">✕</span>`;
    const meta = h.ok
      ? `${h.count} event${h.count === 1 ? '' : 's'}`
      : 'failed';
    return `
      <li class="history-item" data-index="${i}">
        <div class="h-question">${escapeHtml(h.question)}</div>
        <div class="h-meta">${badge} ${meta}</div>
      </li>
    `;
  }).join('');

  historyList.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index, 10);
      const q = history[idx].question;
      input.value = q;
      composer.requestSubmit();
    });
  });
}

composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = input.value.trim();
  if (!question) return;

  addMessage('user', escapeHtml(question));
  input.value = '';
  askBtn.disabled = true;
  suggestions.querySelectorAll('button').forEach(b => b.disabled = true);

  resetTrace();
  setStepActive(1);

  const thinkingMsg = addMessage('assistant', '<span class="thinking-row"><span class="spinner"></span>Working…</span>');

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      setStepError(1);
      thinkingMsg.className = 'msg msg-error';
      thinkingMsg.textContent = data.error || 'Something went wrong.';
      if (data.spl) {
        splOutput.textContent = data.spl;
        setStepDone(1);
        setStepError(2);
      }
      addToHistory(question, false, 0);
      return;
    }

    // Step 1 done
    splOutput.textContent = data.spl;
    setStepDone(1);

    // Step 2
    setStepActive(2);
    eventsOutput.innerHTML = renderEventsTable(data.events);
    setStepDone(2);

    // Step 3
    setStepActive(3);
    summaryPreview.textContent = data.summary;
    setStepDone(3);

    // Final assistant message
    const eventsHtml = renderEventsTable(data.events);
    thinkingMsg.className = 'msg msg-assistant';
    thinkingMsg.innerHTML = `
      <p>${escapeHtml(data.summary).replace(/\n/g, '<br>')}</p>
      ${eventsHtml}
    `;

    addToHistory(question, true, data.event_count || 0);

  } catch (err) {
    setStepError(1);
    thinkingMsg.className = 'msg msg-error';
    thinkingMsg.textContent = 'Request failed: ' + err.message;
    addToHistory(question, false, 0);
  } finally {
    askBtn.disabled = false;
    suggestions.querySelectorAll('button').forEach(b => b.disabled = false);
    input.focus();
  }
});

suggestions.querySelectorAll('.suggestion-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.q;
    composer.requestSubmit();
  });
});