let ws;
let costChart = null;
let timelineChart = null;
let activeTimelineWindow = '7d';

function sanitizeHtml(html) {
  if (window.DOMPurify) {
    return window.DOMPurify.sanitize(String(html), { USE_PROFILES: { html: true } });
  }
  return String(html)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setSafeHTML(el, html) {
  el.innerHTML = sanitizeHtml(html);
}


// Load budget from localStorage (default $50)
function getBudget() {
  const saved = localStorage.getItem('monthlyBudget');
  return saved ? parseFloat(saved) : 50;
}

function isBudgetEnabled() {
  const saved = localStorage.getItem('budgetEnabled');
  return saved === null ? true : saved === 'true';
}

function setBudget(amount) {
  localStorage.setItem('monthlyBudget', amount);
}

function setBudgetEnabled(enabled) {
  localStorage.setItem('budgetEnabled', enabled ? 'true' : 'false');
}

function openSettings() {
  document.getElementById('budgetInput').value = getBudget();
  document.getElementById('budgetEnabled').checked = isBudgetEnabled();
  document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('active');
}

function saveBudget() {
  const budgetEnabled = document.getElementById('budgetEnabled').checked;
  const budget = parseFloat(document.getElementById('budgetInput').value);

  if (!budgetEnabled) {
    setBudgetEnabled(false);
    closeSettings();
    loadProjection();
    return;
  }

  if (budget && budget > 0) {
    setBudgetEnabled(true);
    setBudget(budget);
    closeSettings();
    loadProjection();
  } else {
    alert('Please enter a valid budget amount');
  }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modal = document.getElementById('settingsModal');
  if (e.target === modal) {
    closeSettings();
  }
});

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);
  
  ws.onopen = () => {
    updateStatus('connected', 'Connected');
    loadTimeline(activeTimelineWindow);
    loadDailyBreakdown(7);
    loadCronUsage(2);
    loadProjection();
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    renderData(data);
  };
  
  ws.onerror = () => {
    updateStatus('error', 'Connection Error');
  };
  
  ws.onclose = () => {
    updateStatus('error', 'Disconnected');
    setTimeout(connect, 3000);
  };
}

async function loadHistoricalData() {
  try {
    const response = await fetch('/api/history?days=7');
    const history = await response.json();
    renderChart(history);
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

async function loadProjection() {
  try {
    const response = await fetch('/api/projection');
    const projection = await response.json();
    renderProjection(projection);
  } catch (error) {
    console.error('Failed to load projection:', error);
  }
}

function updateStatus(className, text) {
  const status = document.getElementById('status');
  status.className = `status-badge ${className}`;
  status.querySelector('.status-text').textContent = text;
}

function formatCost(cost) {
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens) {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function renderChart(history) {
  const existingChart = document.getElementById('costChart');
  if (!existingChart) return;
  
  if (history.length === 0) {
    const container = existingChart.closest('.chart-card');
    if (container) {
      container.innerHTML = `
        <h2>📈 7-Day Cost History</h2>
        <div class="empty-state">
          <h3>📊 Graph Coming Soon</h3>
          <p>Your cost history will appear here after 24 hours of usage.</p>
          <p style="margin-top: 10px;">The app automatically tracks your spending every hour.</p>
        </div>
      `;
    }
    return;
  }
  
  const labels = history.map(h => {
    const date = new Date(h.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  const costs = history.map(h => h.cost);
  
  if (costChart) {
    costChart.destroy();
  }
  
  const ctx = existingChart.getContext('2d');
  costChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Daily Cost ($)',
        data: costs,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        tension: 0.4,
        fill: true,
        borderWidth: 3,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#667eea',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#667eea',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false
          },
          ticks: {
            color: '#94a3b8',
            callback: function(value) {
              return '$' + value.toFixed(2);
            }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#94a3b8'
          }
        }
      }
    }
  });
}

async function loadCronUsage(days = 2) {
  try {
    const response = await fetch(`/api/cron-usage?days=${days}`);
    const data = await response.json();
    renderCronUsage(data);
  } catch (error) {
    console.error('Failed to load cron usage:', error);
  }
}

function renderCronUsage(data) {
  const el = document.getElementById('cronUsageBreakdown');
  if (!el) return;
  const days = (data && data.days) ? data.days.slice().reverse() : [];
  if (!days.length) {
    el.innerHTML = '<div class="empty-state"><p>No cron usage data.</p></div>';
    return;
  }

  let html = '';
  for (const d of days) {
    html += `<h3 style="margin:16px 0 8px;">${d.day} (UTC)</h3>`;
    html += '<div class="daily-table-wrap"><table class="daily-table"><thead><tr><th>Cron</th><th>Input</th><th>Output</th><th>Total</th><th>Runs</th><th>Errors</th></tr></thead><tbody>';
    for (const c of d.crons) {
      html += `<tr><td>${c.name}</td><td>${formatTokens(c.input)}</td><td>${formatTokens(c.output)}</td><td>${formatTokens(c.total)}</td><td>${c.runs}</td><td>${c.errors}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }

  // Hourly drilldown (top 5 by recent total)
  const hourly = data.hourlyByCron || {};
  const top = Object.entries(hourly)
    .map(([name, rows]) => ({ name, total: rows.reduce((s, r) => s + (r.total || 0), 0), rows }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (top.length) {
    html += '<h3 style="margin:18px 0 8px;">Last 24h hourly drilldown (top 5 crons)</h3>';
    for (const t of top) {
      html += `<details style="margin-bottom:10px;"><summary><strong>${t.name}</strong> — ${formatTokens(t.total)}</summary>`;
      html += '<div class="daily-table-wrap"><table class="daily-table"><thead><tr><th>Hour (UTC)</th><th>Input</th><th>Output</th><th>Total</th><th>Runs</th><th>Errors</th></tr></thead><tbody>';
      for (const r of t.rows) {
        html += `<tr><td>${r.hour}</td><td>${formatTokens(r.input)}</td><td>${formatTokens(r.output)}</td><td>${formatTokens(r.total)}</td><td>${r.runs}</td><td>${r.errors}</td></tr>`;
      }
      html += '</tbody></table></div></details>';
    }
  }

  setSafeHTML(el, html);
}

async function loadDailyBreakdown(days = 7) {
  try {
    const response = await fetch(`/api/daily-breakdown?days=${days}`);
    const data = await response.json();
    renderDailyBreakdown(data);
  } catch (error) {
    console.error('Failed to load daily breakdown:', error);
  }
}

function renderDailyBreakdown(data) {
  const el = document.getElementById('dailyBreakdown');
  if (!el) return;
  const days = (data && data.days) ? data.days.slice().reverse() : [];
  if (!days.length) {
    el.innerHTML = '<div class="empty-state"><p>No daily breakdown data yet.</p></div>';
    return;
  }

  let html = '<div class="daily-table-wrap"><table class="daily-table"><thead><tr><th>Date</th><th>Cron Tokens</th><th>Top Cron</th><th>Bots Tokens</th><th>Top Bot</th><th>Agents Tokens</th><th>Top Agent</th></tr></thead><tbody>';

  for (const d of days) {
    const cronTokens = (d.totals.cronInput || 0) + (d.totals.cronOutput || 0);
    const botTokens = (d.bots || []).reduce((s, b) => s + (b.total || 0), 0);
    const agentTokens = (d.totals.agentInput || 0) + (d.totals.agentOutput || 0);
    const topCron = (d.cron && d.cron[0]) ? `${d.cron[0].name} (${formatTokens(d.cron[0].total)})` : '-';
    const topBot = (d.bots && d.bots[0]) ? `${d.bots[0].agent} (${formatTokens(d.bots[0].total)})` : '-';
    const topAgent = (d.agents && d.agents[0]) ? `${d.agents[0].agent} (${formatTokens(d.agents[0].total)})` : '-';

    html += `<tr>
      <td>${d.date}</td>
      <td>${formatTokens(cronTokens)}</td>
      <td>${topCron}</td>
      <td>${formatTokens(botTokens)}</td>
      <td>${topBot}</td>
      <td>${formatTokens(agentTokens)}</td>
      <td>${topAgent}</td>
    </tr>`;
  }

  html += '</tbody></table></div>';
  setSafeHTML(el, html);
}

async function loadTimeline(windowKey = activeTimelineWindow) {
  activeTimelineWindow = windowKey;

  // Tab UI state
  const tabs = document.querySelectorAll('.timeline-tab');
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.window === windowKey);
  });

  try {
    const response = await fetch(`/api/timeline?window=${encodeURIComponent(windowKey)}`);
    const data = await response.json();
    renderTimelineChart(data, windowKey);
  } catch (error) {
    console.error('Failed to load timeline:', error);
  }
}

function renderTimelineChart(data, windowKey) {
  const canvas = document.getElementById('timelineChart');
  if (!canvas || !data || !Array.isArray(data.labels)) return;

  const labels = data.labels.map(ts => {
    const d = new Date(ts);
    if (windowKey === '7d') {
      return d.toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  });

  const palette = ['#667eea', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#22d3ee'];
  const topModels = (data.models || []).slice(0, 5);

  const datasets = topModels.map((m, idx) => ({
    type: 'line',
    label: m.display,
    data: m.points,
    borderColor: palette[idx % palette.length],
    backgroundColor: 'transparent',
    tension: 0.25,
    borderWidth: 2,
    pointRadius: 0,
    yAxisID: 'yTokens'
  }));

  datasets.push({
    type: 'bar',
    label: 'Errors',
    data: (data.errors && data.errors.all) ? data.errors.all : [],
    yAxisID: 'yErrors',
    backgroundColor: 'rgba(239, 68, 68, 0.35)',
    borderColor: 'rgba(239, 68, 68, 0.8)',
    borderWidth: 1,
    barThickness: 'flex'
  });

  datasets.push({
    type: 'line',
    label: 'Cooldown errors',
    data: (data.errors && data.errors.cooldown) ? data.errors.cooldown : [],
    yAxisID: 'yErrors',
    borderColor: '#f59e0b',
    backgroundColor: 'transparent',
    tension: 0.2,
    borderWidth: 2,
    pointRadius: 0
  });

  if (timelineChart) timelineChart.destroy();

  timelineChart = new Chart(canvas.getContext('2d'), {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8' } },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          titleColor: '#fff',
          bodyColor: '#fff'
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        yTokens: {
          position: 'left',
          ticks: {
            color: '#94a3b8',
            callback: (v) => formatTokens(v)
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        yErrors: {
          position: 'right',
          beginAtZero: true,
          ticks: { color: '#fca5a5', precision: 0 },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });

  const info = document.getElementById('timelineMeta');
  if (info && data.meta) {
    info.textContent = `${windowKey.toUpperCase()} · 5m buckets · ${data.meta.totalRuns || 0} runs · ${data.meta.errorRuns || 0} errors`;
  }
}

function renderProjection(projection) {
  if (!projection || !projection.projectedMonthTotal) return;
  if (!isBudgetEnabled()) return;

  const budget = getBudget();
  const percentOver = ((projection.projectedMonthTotal / budget) - 1) * 100;

  // Show budget alert if over threshold
  if (projection.projectedMonthTotal > budget) {
    const alertHtml = `
      <div class="alert ${projection.projectedMonthTotal > budget * 1.5 ? 'alert-danger' : 'alert-warning'}">
        <div class="alert-icon">${projection.projectedMonthTotal > budget * 1.5 ? '🚨' : '⚠️'}</div>
        <div>
          <strong>${projection.projectedMonthTotal > budget * 1.5 ? 'Critical Budget Alert!' : 'Budget Warning'}</strong><br>
          You're projected to exceed your $${budget.toFixed(0)} monthly budget by ${percentOver.toFixed(0)}%
        </div>
      </div>
    `;
    
    const contentDiv = document.getElementById('content');
    const existingAlert = contentDiv.querySelector('.alert');
    if (existingAlert) {
      existingAlert.insertAdjacentHTML('beforebegin', sanitizeHtml(alertHtml));
      existingAlert.remove();
    } else {
      contentDiv.insertAdjacentHTML('afterbegin', sanitizeHtml(alertHtml));
    }
  }
}

function estimatePlanAdjustedCost(byModel = {}) {
  let effective = 0;
  const notes = [];

  for (const [model, stats] of Object.entries(byModel)) {
    const cost = Number(stats.cost || 0);
    // Plan-backed lanes (no marginal API cost in this view)
    const isPlanBacked = model.startsWith('anthropic/') || model.startsWith('openai-codex/') || model.startsWith('google-gemini-cli/');
    if (!isPlanBacked) effective += cost;
  }

  notes.push('Plan-backed providers treated as $0 marginal cost (Anthropic OAuth/Max, OpenAI Codex Pro, Gemini workspace).');
  notes.push('API-key providers remain billable in this estimate (e.g., anthropic-personal-api, anthropic-work, openai/...).');

  return { effective, notes };
}

function renderData(data) {
  if (data.error) {
    const content = document.getElementById('content');
    setSafeHTML(content, `
      <div class="chart-card">
        <h2 style="color: #ef4444;">⚠️ Error</h2>
        <p style="color: #94a3b8; margin-top: 15px;">${data.error}</p>
        <p style="color: #94a3b8; margin-top: 10px;">Make sure Claude Code is installed and has session data in ~/.claude/projects/</p>
      </div>
    `);
    return;
  }
  
  const totalTokens = data.totalInputTokens + data.totalOutputTokens + 
                      data.totalCacheReadTokens + data.totalCacheWriteTokens;
  const budget = getBudget();
  const budgetEnabled = isBudgetEnabled();
  const planAdjusted = estimatePlanAdjustedCost(data.byModel || {});
  
  // Format tracking info
  let lastUpdateText = '';
  if (data.metadata && data.metadata.lastUpdate) {
    const updateDate = new Date(data.metadata.lastUpdate);
    lastUpdateText = updateDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  let html = '';
  
  // Tracking info banner
  if (data.metadata) {
    html += `
      <div class="stat-card" style="background: rgba(102, 126, 234, 0.1); border-color: rgba(102, 126, 234, 0.3); margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 5px;">📊 PARSING JSONL SESSION FILES</div>
            <div style="font-size: 1rem; color: #f1f5f9;">
              Found <strong>${data.metadata.jsonlFilesFound || 0}</strong> session files with <strong>${data.metadata.totalMessages || 0}</strong> messages
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.85rem; color: #94a3b8;">Sessions with data</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: #667eea;">
              ${data.metadata.sessionsWithData || 0}
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  // Budget alert
  if (budgetEnabled && data.totalCost > budget * 0.8) {
    const percentUsed = ((data.totalCost / budget) * 100).toFixed(0);
    const isOverBudget = data.totalCost > budget;
    
    html += `
      <div class="alert ${isOverBudget ? 'alert-danger' : 'alert-warning'}">
        <div class="alert-icon">${isOverBudget ? '🚨' : '⚠️'}</div>
        <div>
          <strong>${isOverBudget ? 'Over Budget!' : 'Budget Warning'}</strong><br>
          You've spent $${data.totalCost.toFixed(2)} of your $${budget.toFixed(0)} monthly budget (${percentUsed}%)
        </div>
      </div>
    `;
  }
  
  // Calculate caching savings (rendered later, after model breakdown)
  const costWithoutCaching = data.costWithoutCaching || 0;
  const savingsFromCaching = data.cachingSavings || 0;
  const savingsPercent = costWithoutCaching > 0 ? ((savingsFromCaching / costWithoutCaching) * 100) : 0;

  // Stats cards
  html += `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Total Cost</div>
        </div>
        <div class="stat-value">${formatCost(data.totalCost)}</div>
        <div class="stat-subtext">All-time spending</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">🎯</div>
          <div class="stat-label">
            <span class="tooltip">Total Tokens
              <span class="tooltiptext">
                <strong>What are tokens?</strong><br><br>
                Tokens are pieces of text (≈4 characters or ¾ of a word).<br><br>
                <strong>Types:</strong><br>
                • Input: Your messages<br>
                • Output: AI responses<br>
                • Cached: Reused history (90% cheaper!)<br><br>
                More tokens = higher cost, but caching dramatically reduces this.
              </span>
            </span>
          </div>
        </div>
        <div class="stat-value">${formatTokens(totalTokens)}</div>
        <div class="stat-subtext">${formatTokens(data.totalCacheReadTokens)} cached (90% discount)</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">💬</div>
          <div class="stat-label">Active Sessions</div>
        </div>
        <div class="stat-value">${data.sessions.length}</div>
        <div class="stat-subtext">${Object.keys(data.byModel).length} model${Object.keys(data.byModel).length !== 1 ? 's' : ''} in use</div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon">🧾</div>
          <div class="stat-label">Plan-Adjusted Cost</div>
        </div>
        <div class="stat-value">${formatCost(planAdjusted.effective)}</div>
        <div class="stat-subtext">API-equivalent: ${formatCost(data.totalCost)}</div>
      </div>
    </div>
  `;
  
  if (!budgetEnabled) {
    html += `
      <div class="stat-card" style="margin-top: 12px; border-color: rgba(148,163,184,0.35);">
        <div style="color:#94a3b8;">💸 Budget alerts are currently disabled</div>
      </div>
    `;
  }

  html += `
    <div class="stat-card" style="margin-top: 12px; border-color: rgba(102,126,234,0.25);">
      <div style="color:#94a3b8; font-size:0.85rem;">${planAdjusted.notes[0]}</div>
      <div style="color:#94a3b8; font-size:0.85rem; margin-top:4px;">${planAdjusted.notes[1]}</div>
    </div>
  `;

  // Timeline chart with tabs
  html += `
    <div class="chart-card">
      <div class="timeline-header">
        <h2>📈 Usage + Errors Timeline</h2>
        <div class="timeline-tabs">
          <button class="timeline-tab" data-window="4h" onclick="loadTimeline('4h')">Last 4h</button>
          <button class="timeline-tab" data-window="24h" onclick="loadTimeline('24h')">24h</button>
          <button class="timeline-tab active" data-window="7d" onclick="loadTimeline('7d')">7d</button>
        </div>
      </div>
      <div id="timelineMeta" class="timeline-meta"></div>
      <div class="chart-container">
        <canvas id="timelineChart"></canvas>
      </div>
    </div>
  `;
  
  // Model breakdown
  const sortedModels = Object.entries(data.byModel).sort((a, b) => b[1].cost - a[1].cost);
  
  if (sortedModels.length > 0) {
    html += `<div class="model-card"><h2>💰 Cost by Model</h2>`;
    
    sortedModels.forEach(([model, stats]) => {
      const percentage = ((stats.cost / data.totalCost) * 100).toFixed(1);
      const totalModelTokens = stats.inputTokens + stats.outputTokens + 
                               stats.cacheReadTokens + stats.cacheWriteTokens;
      const sessions = stats.sessions || 1;
      const avgCostPerSession = sessions > 0 ? (stats.cost / sessions) : 0;

      const displayName = model.replace('anthropic/', '').replace('openai/', '');

      let tokenInfo = `${formatTokens(totalModelTokens)} tokens`;
      if (stats.cacheReadTokens > 0) {
        tokenInfo += ` (${formatTokens(stats.cacheReadTokens)} cached)`;
      }

      html += `
        <div class="model-item">
          <div class="model-info">
            <div class="model-name">${displayName}</div>
            <div class="model-meta">
              ${stats.messageCount || 0} messages in ${sessions} session${sessions !== 1 ? 's' : ''} ·
              ${tokenInfo} ·
              Avg ${formatCost(avgCostPerSession)}/session
            </div>
          </div>
          <div class="model-stats">
            <div class="model-cost">${formatCost(stats.cost)}</div>
            <div class="model-percentage">${percentage}% of total</div>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
  }

  // Model usage + remaining status
  if (sortedModels.length > 0) {
    html += `<div class="model-card"><h2>📌 Model Usage & Remaining</h2>`;
    html += `<p class="setting-help">Remaining quota is only available when provider quota APIs are configured. This view always shows per-model usage from your local logs.</p>`;
    html += '<div class="daily-table-wrap"><table class="daily-table"><thead><tr><th>Model</th><th>Tokens Used</th><th>Cost</th><th>Remaining</th></tr></thead><tbody>';
    sortedModels.forEach(([model, stats]) => {
      const used = (stats.inputTokens || 0) + (stats.outputTokens || 0) + (stats.cacheReadTokens || 0) + (stats.cacheWriteTokens || 0);
      const name = model.replace('anthropic/', '').replace('openai/', '');
      html += `<tr><td>${name}</td><td>${formatTokens(used)}</td><td>${formatCost(stats.cost || 0)}</td><td>n/a (provider quota API required)</td></tr>`;
    });
    html += '</tbody></table></div></div>';
  }

  // Daily dimension breakdown
  html += `
    <div class="model-card">
      <h2>📅 Daily Breakdown (Cron / Bots / Agents)</h2>
      <div id="dailyBreakdown" class="empty-state"><p>Loading daily breakdown…</p></div>
    </div>

    <div class="model-card">
      <h2>⏱️ Cron Usage (All Crons Daily + Hourly)</h2>
      <div id="cronUsageBreakdown" class="empty-state"><p>Loading cron usage…</p></div>
    </div>
  `;

  // Compact caching savings (below model breakdown)
  if (data.totalCacheReadTokens > 0 && savingsFromCaching > 0.10) {
    html += `
      <div class="savings-compact">
        <span class="savings-compact-icon">💚</span>
        <span class="savings-compact-text">
          Prompt caching saved <strong>${formatCost(savingsFromCaching)}</strong> (${savingsPercent.toFixed(0)}% off) &mdash;
          ${formatTokens(data.totalCacheReadTokens)} cached tokens at 90% discount
        </span>
      </div>
    `;
  }

  setSafeHTML(document.getElementById('content'), html);
  
  // Re-render timeline, breakdowns, and projection
  loadTimeline(activeTimelineWindow);
  loadDailyBreakdown(7);
  loadCronUsage(2);
  loadProjection();
}

// Initialize
connect();

// Reload projection every 5 minutes
setInterval(loadProjection, 5 * 60 * 1000);
