const fs = require('fs');
const path = require('path');
const os = require('os');

// Store accumulated session data in user's home dir (persists across app updates)
const STORAGE_DIR = path.join(os.homedir(), '.clawdbot-cost-monitor');
const SESSIONS_DB = path.join(STORAGE_DIR, 'sessions-seen.json');
const METADATA_FILE = path.join(STORAGE_DIR, 'metadata.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

/**
 * Load all sessions we've seen before
 */
function loadSeenSessions() {
  if (!fs.existsSync(SESSIONS_DB)) {
    return {};
  }
  
  try {
    const data = fs.readFileSync(SESSIONS_DB, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading sessions DB:', error);
    return {};
  }
}

/**
 * Save sessions we've seen
 */
function saveSeenSessions(sessions) {
  try {
    fs.writeFileSync(SESSIONS_DB, JSON.stringify(sessions, null, 2));
  } catch (error) {
    console.error('Error saving sessions DB:', error);
  }
}

/**
 * Load metadata (tracking start date, etc.)
 */
function loadMetadata() {
  if (!fs.existsSync(METADATA_FILE)) {
    // First run - initialize metadata
    const metadata = {
      trackingStarted: Date.now(),
      trackingStartedDate: new Date().toISOString(),
      lastUpdate: Date.now(),
      totalSessionsSeen: 0
    };
    saveMetadata(metadata);
    return metadata;
  }
  
  try {
    const data = fs.readFileSync(METADATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading metadata:', error);
    return {
      trackingStarted: Date.now(),
      trackingStartedDate: new Date().toISOString(),
      lastUpdate: Date.now(),
      totalSessionsSeen: 0
    };
  }
}

/**
 * Save metadata
 */
function saveMetadata(metadata) {
  try {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('Error saving metadata:', error);
  }
}

/**
 * Accumulate session data - merge new sessions with what we've seen before
 */
function accumulateSessions(currentAnalysis) {
  const seenSessions = loadSeenSessions();
  const metadata = loadMetadata();
  
  // Track which sessions are currently active (for session count)
  const activeSessions = {};
  
  // Process each session from current analysis
  if (currentAnalysis.sessions) {
    currentAnalysis.sessions.forEach(session => {
      const sessionId = session.key;
      activeSessions[sessionId] = true;
      
      // If we've never seen this session before, or if data has changed
      if (!seenSessions[sessionId] || seenSessions[sessionId].cost !== session.cost) {
        seenSessions[sessionId] = {
          key: sessionId,
          model: session.model,
          inputTokens: session.inputTokens || 0,
          outputTokens: session.outputTokens || 0,
          cacheWriteTokens: session.cacheWriteTokens || 0,
          cacheReadTokens: session.cacheReadTokens || 0,
          cost: session.cost,
          costBreakdown: session.costBreakdown || {},
          lastSeen: Date.now(),
          firstSeen: seenSessions[sessionId]?.firstSeen || Date.now()
        };
      }
    });
  }
  
  // Calculate lifetime totals from ALL sessions we've ever seen
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCost = 0;
  const byModel = {};
  
  Object.values(seenSessions).forEach(session => {
    totalInputTokens += session.inputTokens;
    totalOutputTokens += session.outputTokens;
    totalCacheWriteTokens += session.cacheWriteTokens;
    totalCacheReadTokens += session.cacheReadTokens;
    totalCost += session.cost;
    
    // Aggregate by model
    if (!byModel[session.model]) {
      byModel[session.model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        sessions: 0
      };
    }
    
    byModel[session.model].inputTokens += session.inputTokens;
    byModel[session.model].outputTokens += session.outputTokens;
    byModel[session.model].cacheWriteTokens += session.cacheWriteTokens;
    byModel[session.model].cacheReadTokens += session.cacheReadTokens;
    byModel[session.model].cost += session.cost;
    byModel[session.model].sessions += 1;
  });
  
  // Update metadata
  metadata.lastUpdate = Date.now();
  metadata.totalSessionsSeen = Object.keys(seenSessions).length;
  metadata.activeSessionCount = Object.keys(activeSessions).length;
  
  // Save everything
  saveSeenSessions(seenSessions);
  saveMetadata(metadata);
  
  // Return accumulated totals
  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheWriteTokens,
    totalCacheReadTokens,
    totalCost,
    byModel,
    sessions: Object.values(seenSessions).map(s => ({
      key: s.key,
      model: s.model,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheWriteTokens: s.cacheWriteTokens,
      cacheReadTokens: s.cacheReadTokens,
      cost: s.cost,
      costBreakdown: s.costBreakdown,
      lastUpdated: s.lastSeen
    })),
    metadata: {
      trackingSince: metadata.trackingStartedDate,
      lastUpdate: metadata.lastUpdate,
      totalSessionsSeen: metadata.totalSessionsSeen,
      activeSessionCount: metadata.activeSessionCount
    }
  };
}

/**
 * Get tracking metadata (when did tracking start, etc.)
 */
function getMetadata() {
  return loadMetadata();
}

/**
 * Reset all accumulated data (for testing or fresh start)
 */
function resetAccumulation() {
  if (fs.existsSync(SESSIONS_DB)) {
    fs.unlinkSync(SESSIONS_DB);
  }
  if (fs.existsSync(METADATA_FILE)) {
    fs.unlinkSync(METADATA_FILE);
  }
  console.log('Accumulation data reset.');
}

module.exports = {
  accumulateSessions,
  getMetadata,
  resetAccumulation
};
