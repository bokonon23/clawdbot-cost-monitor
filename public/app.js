let ws;
let costChart = null;

// Load budget from localStorage (default $50)
function getBudget() {
  const saved = localStorage.getItem('monthlyBudget');
  return saved ? parseFloat(saved) : 50;
}

function setBudget(amount) {
  localStorage.setItem('monthlyBudget', amount);
}

function openSettings() {
  document.getElementById('budgetInput').value = getBudget();
  document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('active');
}

function saveBudget() {
  const budget = parseFloat(document.getElementById('budgetInput').value);
  if (budget && budget > 0) {
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
    loadHistoricalData();
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

function renderProjection(projection) {
  if (!projection || !projection.projectedMonthTotal) return;
  
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
      existingAlert.outerHTML = alertHtml;
    } else {
      contentDiv.insertAdjacentHTML('afterbegin', alertHtml);
    }
  }
}

function renderData(data) {
  if (data.error) {
    document.getElementById('content').innerHTML = `
      <div class="chart-card">
        <h2 style="color: #ef4444;">⚠️ Error</h2>
        <p style="color: #94a3b8; margin-top: 15px;">${data.error}</p>
        <p style="color: #94a3b8; margin-top: 10px;">Make sure Claude Code is installed and has session data in ~/.claude/projects/</p>
      </div>
    `;
    return;
  }
  
  const totalTokens = data.totalInputTokens + data.totalOutputTokens + 
                      data.totalCacheReadTokens + data.totalCacheWriteTokens;
  const budget = getBudget();
  
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
  if (data.totalCost > budget * 0.8) {
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
    </div>
  `;
  
  // Chart
  html += `
    <div class="chart-card">
      <h2>📈 7-Day Cost History</h2>
      <div class="chart-container">
        <canvas id="costChart"></canvas>
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

  document.getElementById('content').innerHTML = html;
  
  // Re-render chart and projection
  loadHistoricalData();
  loadProjection();
}

// Initialize
connect();

// Reload projection every 5 minutes
setInterval(loadProjection, 5 * 60 * 1000);
