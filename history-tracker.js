const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(HISTORY_DIR, 'cost-history.json');

// Ensure data directory exists
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }
  
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading history:', error);
    return [];
  }
}

function saveSnapshot(analysis) {
  const history = loadHistory();
  
  const snapshot = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    totalCost: analysis.totalCost || 0,
    totalInputTokens: analysis.totalInputTokens || 0,
    totalOutputTokens: analysis.totalOutputTokens || 0,
    models: Object.keys(analysis.byModel || {}).map(model => ({
      name: model,
      cost: analysis.byModel[model].cost
    }))
  };
  
  history.push(snapshot);
  
  // Keep only last 30 days
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const recentHistory = history.filter(s => s.timestamp > thirtyDaysAgo);
  
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(recentHistory, null, 2));
  
  return recentHistory;
}

function getDailyStats(days = 7) {
  const history = loadHistory();
  
  if (history.length === 0) {
    return [];
  }
  
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const recentHistory = history.filter(s => s.timestamp > cutoff);
  
  // Group by day
  const dailyMap = {};
  
  recentHistory.forEach(snapshot => {
    const date = new Date(snapshot.timestamp);
    const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (!dailyMap[dayKey]) {
      dailyMap[dayKey] = {
        date: dayKey,
        cost: 0,
        tokens: 0,
        snapshots: []
      };
    }
    
    dailyMap[dayKey].snapshots.push(snapshot);
  });
  
  // Calculate daily totals (max for each day = end of day)
  const sortedDays = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  const dailyStats = sortedDays.map((day, index) => {
    const lastSnapshot = day.snapshots[day.snapshots.length - 1];
    const firstSnapshot = day.snapshots[0];

    // First day of tracked history: show totalCost since there's no prior day
    const dailyCost = index === 0
      ? lastSnapshot.totalCost
      : lastSnapshot.totalCost - (firstSnapshot.totalCost || 0);

    return {
      date: day.date,
      cost: dailyCost,
      totalCost: lastSnapshot.totalCost,
      tokens: (lastSnapshot.totalInputTokens + lastSnapshot.totalOutputTokens) -
              (firstSnapshot.totalInputTokens + firstSnapshot.totalOutputTokens)
    };
  });
  
  return dailyStats;
}

function getMonthlyProjection() {
  const dailyStats = getDailyStats(7);
  
  if (dailyStats.length < 2) {
    return null;
  }
  
  // Calculate average daily cost
  const totalCost = dailyStats.reduce((sum, day) => sum + day.cost, 0);
  const avgDailyRate = totalCost / dailyStats.length;
  
  // Project to end of month
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - now.getDate();
  
  const projectedAdditional = avgDailyRate * daysRemaining;
  const currentMonthTotal = dailyStats[dailyStats.length - 1]?.totalCost || 0;
  const projectedMonthTotal = currentMonthTotal + projectedAdditional;
  
  return {
    avgDailyRate,
    daysRemaining,
    projectedMonthTotal,
    currentMonthTotal
  };
}

module.exports = {
  saveSnapshot,
  loadHistory,
  getDailyStats,
  getMonthlyProjection
};
