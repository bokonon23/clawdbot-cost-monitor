const fs = require('fs');
const path = require('path');
const os = require('os');
const { accumulateSessions } = require('./session-accumulator');

// Model pricing (per million tokens)
// Note: Anthropic models support prompt caching which dramatically reduces costs
const MODEL_PRICING = {
  'anthropic/claude-sonnet-4-5': { 
    input: 3.00, 
    output: 15.00,
    cacheWrite: 3.75,   // 25% premium for writing to cache
    cacheRead: 0.30      // 90% discount for reading from cache
  },
  'anthropic/claude-sonnet-4': { 
    input: 3.00, 
    output: 15.00,
    cacheWrite: 3.75,
    cacheRead: 0.30
  },
  'anthropic/claude-opus-4': { 
    input: 15.00, 
    output: 75.00,
    cacheWrite: 18.75,
    cacheRead: 1.50
  },
  'anthropic/claude-3-5-sonnet-20241022': { 
    input: 3.00, 
    output: 15.00,
    cacheWrite: 3.75,
    cacheRead: 0.30
  },
  'anthropic/claude-3-5-sonnet': { 
    input: 3.00, 
    output: 15.00,
    cacheWrite: 3.75,
    cacheRead: 0.30
  },
  'google/gemini-2.5-flash': {
  input: 0.30,     // text/image/video standard
  output: 2.50,
  // If caching is used in your setup:
  cacheWrite: 0.375,  // example; actual is often lower
  cacheRead: 0.03
  },
  'openai/gpt-4': { input: 30.00, output: 60.00 },
  'openai/gpt-4-turbo': { input: 10.00, output: 30.00 },
  'openai/gpt-3.5-turbo': { input: 0.50, output: 1.50 },
};

// Default pricing for unknown models
const DEFAULT_PRICING = { 
  input: 3.00, 
  output: 15.00,
  cacheWrite: 3.75,
  cacheRead: 0.30
};

function getSessionsDirPath() {
  const homeDir = os.homedir();
  return path.join(homeDir, '.openclaw', 'agents', 'main', 'sessions');
}

function parseJsonlFile(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return fileContent.split('\n').filter(line => line.trim() !== '').map(JSON.parse);
}

function calculateCost(tokenBreakdown, model) {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  
  const inputCost = (tokenBreakdown.input / 1_000_000) * pricing.input;
  const outputCost = (tokenBreakdown.output / 1_000_000) * pricing.output;
  
  let cacheWriteCost = 0;
  let cacheReadCost = 0;
  
  // Handle prompt caching if supported and present
  if (pricing.cacheWrite && tokenBreakdown.cacheWrite > 0) {
    cacheWriteCost = (tokenBreakdown.cacheWrite / 1_000_000) * pricing.cacheWrite;
  }
  
  if (pricing.cacheRead && tokenBreakdown.cacheRead > 0) {
    cacheReadCost = (tokenBreakdown.cacheRead / 1_000_000) * pricing.cacheRead;
  }
  
  return {
    total: inputCost + outputCost + cacheWriteCost + cacheReadCost,
    breakdown: {
      input: inputCost,
      output: outputCost,
      cacheWrite: cacheWriteCost,
      cacheRead: cacheReadCost
    }
  };
}

function readSessionData() {
  try {
    const sessionsDirPath = getSessionsDirPath();

    if (!fs.existsSync(sessionsDirPath)) {
      return { error: 'Sessions directory not found. Is OpenClaw (Clawdbot) running?' };
    }

    const sessionFiles = fs.readdirSync(sessionsDirPath).filter(file => file.endsWith('.jsonl'));
    const allSessions = {}; // To store aggregated data for each session

    for (const file of sessionFiles) {
      const sessionKey = file.replace('.jsonl', ''); // Extract session key from filename
      const filePath = path.join(sessionsDirPath, file);
      const events = parseJsonlFile(filePath);

      let sessionData = {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        model: 'unknown',
        modelProvider: 'unknown',
        updatedAt: 0,
        key: sessionKey // Add session key to sessionData
      };

      for (const event of events) {
        if (event.type === 'message' && event.message && event.message.role === 'assistant' && event.message.usage) {
          const usage = event.message.usage;
          sessionData.inputTokens += usage.input || 0;
          sessionData.outputTokens += usage.output || 0;
          sessionData.cacheWriteTokens += usage.cacheWrite || 0;
          sessionData.cacheReadTokens += usage.cacheRead || 0;
          sessionData.totalTokens += usage.totalTokens || 0;
          if (event.message.model) {
            sessionData.model = event.message.model;
          }
          if (event.message.provider) { // Provider field is often at the top level of message
            sessionData.modelProvider = event.message.provider;
          } else if (event.message.api) { // Fallback for some models where api is provider
            sessionData.modelProvider = event.message.api.split('-')[0]; // e.g., anthropic-messages -> anthropic
          }
          if (event.timestamp) {
            sessionData.updatedAt = Math.max(sessionData.updatedAt, new Date(event.timestamp).getTime());
          }
        } else if (event.type === 'model_change' && event.modelId) {
            sessionData.model = event.modelId;
            sessionData.modelProvider = event.provider;
        }
      }
      allSessions[sessionKey] = sessionData;
    }

    // Convert the allSessions object to an array of sessions, matching the expected format
    const sessionsArray = Object.values(allSessions);

    return { sessions: sessionsArray };
  } catch (error) {
    return { error: `Failed to read sessions: ${error.message}` };
  }
}

function analyzeUsage() {
  const result = readSessionData();
  
  if (result.error) {
    return { error: result.error };
  }
  
  const { sessions } = result;
  
  // First, analyze current sessions (from sessions.json)
  const currentAnalysis = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheWriteTokens: 0,
    totalCacheReadTokens: 0,
    totalCost: 0,
    byModel: {},
    sessions: []
  };
  
  for (const session of sessions) {
    const sessionKey = session.key;
    // Extract token counts
    let inputTokens = session.inputTokens || 0;
    let outputTokens = session.outputTokens || 0;
    let cacheWriteTokens = session.cacheWriteTokens || 0;
    let cacheReadTokens = session.cacheReadTokens || 0;
    
    // Handle case where cache tokens aren't separately tracked
    // If totalTokens > (inputTokens + outputTokens), the difference is likely cache reads
    if (session.totalTokens && session.totalTokens > (inputTokens + outputTokens + cacheWriteTokens + cacheReadTokens)) {
      const unaccountedTokens = session.totalTokens - (inputTokens + outputTokens + cacheWriteTokens);
      // Clawdbot heavily uses prompt caching, so unaccounted tokens are almost certainly cache reads
      cacheReadTokens = unaccountedTokens;
    }
    
    const model = session.model || 'unknown';
    const provider = session.modelProvider || 'unknown';
    const fullModel = provider !== 'unknown' ? `${provider}/${model}` : model;
    
    // Calculate cost with proper cache handling
    const tokenBreakdown = {
      input: inputTokens,
      output: outputTokens,
      cacheWrite: cacheWriteTokens,
      cacheRead: cacheReadTokens
    };
    
    const costResult = calculateCost(tokenBreakdown, fullModel);
    const cost = costResult.total;
    
    // Session details for current analysis
    currentAnalysis.sessions.push({
      key: sessionKey,
      model: fullModel,
      inputTokens,
      outputTokens,
      cacheWriteTokens,
      cacheReadTokens,
      cost,
      costBreakdown: costResult.breakdown,
      lastUpdated: session.updatedAt || null
    });
  }
  
  // Now accumulate with historical data
  const accumulatedAnalysis = accumulateSessions(currentAnalysis);
  
  return accumulatedAnalysis;
}

module.exports = {
  analyzeUsage,
  calculateCost,
  MODEL_PRICING
};
