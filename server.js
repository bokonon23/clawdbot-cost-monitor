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
const UPDATE_INTERVAL = 5000; // Update every 5 seconds
const SNAPSHOT_INTERVAL = 60 * 60 * 1000; // Save snapshot every hour

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for current usage
app.get('/api/usage', (req, res) => {
  const analysis = analyzeUsage();
  res.json(analysis);
});

// API endpoint for historical data
app.get('/api/history', (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const stats = getDailyStats(days);
  res.json(stats);
});

// API endpoint for monthly projection
app.get('/api/projection', (req, res) => {
  const projection = getMonthlyProjection();
  res.json(projection || {});
});

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Send initial data
  ws.send(JSON.stringify(analyzeUsage()));
  
  // Set up periodic updates
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(analyzeUsage()));
    }
  }, UPDATE_INTERVAL);
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
});

// Save initial snapshot on startup
saveSnapshot(analyzeUsage());

// Periodic snapshot saving (every hour)
setInterval(() => {
  const analysis = analyzeUsage();
  if (!analysis.error) {
    saveSnapshot(analysis);
    console.log(`[${new Date().toISOString()}] Snapshot saved. Total cost: $${analysis.totalCost.toFixed(2)}`);
  }
}, SNAPSHOT_INTERVAL);

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   💰 OPENCLAW COST MONITOR v0.3.0                              ║
║                                                                ║
║   Dashboard: http://localhost:${PORT}                            ║
║                                                                ║
║   ✨ Track your OpenClaw/Clawdbot AI spending                  ║
║   💚 Now with accurate prompt caching costs!                   ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});
