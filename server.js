const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { analyzeUsage } = require('./cost-calculator');
const { saveSnapshot, getDailyStats, getMonthlyProjection } = require('./history-tracker');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3939;
const HOST = process.env.HOST || '127.0.0.1'; // Default to localhost for security
const UPDATE_INTERVAL = 30000; // Update every 30 seconds
const SNAPSHOT_INTERVAL = 60 * 60 * 1000; // Save snapshot every hour

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for current usage (now async)
app.get('/api/usage', async (req, res) => {
  try {
    const analysis = await analyzeUsage();
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint for historical data
app.get('/api/history', (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const stats = getDailyStats(days);
  res.json(stats);
});

// API endpoint for plan usage (Max Pro scraped data)
app.get('/api/plan-usage', (req, res) => {
  const usageFile = path.join(__dirname, 'data', 'plan-usage.json');
  try {
    if (require('fs').existsSync(usageFile)) {
      const history = JSON.parse(require('fs').readFileSync(usageFile, 'utf8'));
      const latest = history.length > 0 ? history[history.length - 1] : null;
      res.json({ latest, history });
    } else {
      res.json({ latest: null, history: [], message: 'No plan usage data yet. Run usage-scraper.js to collect data.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint for monthly projection
app.get('/api/projection', (req, res) => {
  const projection = getMonthlyProjection();
  res.json(projection || {});
});

// WebSocket connection
wss.on('connection', async (ws) => {
  console.log('Client connected');

  // Send initial data
  try {
    const initialData = await analyzeUsage();
    ws.send(JSON.stringify(initialData));
  } catch (error) {
    ws.send(JSON.stringify({ error: error.message }));
  }

  // Set up periodic updates
  const interval = setInterval(async () => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        const data = await analyzeUsage();
        ws.send(JSON.stringify(data));
      } catch (error) {
        ws.send(JSON.stringify({ error: error.message }));
      }
    }
  }, UPDATE_INTERVAL);

  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
});

// Initialize on startup
async function initialize() {
  try {
    const initialAnalysis = await analyzeUsage();
    if (!initialAnalysis.error) {
      saveSnapshot(initialAnalysis);
      console.log('Initial snapshot saved. Total cost: $' + initialAnalysis.totalCost.toFixed(2));
    }
  } catch (error) {
    console.error('Error during initialization:', error.message);
  }
}

// Periodic snapshot saving (every hour)
setInterval(async () => {
  try {
    const analysis = await analyzeUsage();
    if (!analysis.error) {
      saveSnapshot(analysis);
      console.log('[' + new Date().toISOString() + '] Snapshot saved. Total cost: $' + analysis.totalCost.toFixed(2));
    }
  } catch (error) {
    console.error('Error saving snapshot:', error.message);
  }
}, SNAPSHOT_INTERVAL);

// Start server - bind to localhost by default for security
// Set HOST=0.0.0.0 to allow network access (e.g., WSL from Windows)
server.listen(PORT, HOST, () => {
  console.log('\n' +
    '========================================\n' +
    '  CLAUDE CODE COST MONITOR v0.6.0\n' +
    '========================================\n' +
    '\n' +
    '  Dashboard: http://' + HOST + ':' + PORT + '\n' +
    '\n' +
    '  Now parsing JSONL session files for\n' +
    '  accurate lifetime cost tracking!\n' +
    '========================================\n'
  );

  // Initialize after server starts
  initialize();
});
