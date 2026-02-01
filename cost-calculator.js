const fs = require('fs');
const path = require('path');
const os = require('os');

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

function getSessionsPath() {
  const homeDir = os.homedir();
  return path.join(homeDir, '.clawdbot', 'agents', 'main', 'sessions', 'sessions.json');
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
    const sessionsPath = getSessionsPath();
    
    if (!fs.existsSync(sessionsPath)) {
      return { error: 'Sessions file not found. Is OpenClaw (Clawdbot) running?' };
    }
    
    const data = fs.readFileSync(sessionsPath, 'utf8');
    const sessions = JSON.parse(data);
    
    return { sessions };
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
  const analysis = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheWriteTokens: 0,
    totalCacheReadTokens: 0,
    totalCost: 0,
    byModel: {},
    sessions: []
  };
  
  for (const [sessionKey, session] of Object.entries(sessions)) {
    // Extract token counts
    let inputTokens = session.inputTokens || 0;
    let outputTokens = session.outputTokens || 0;
    let cacheWriteTokens = session.cacheCreationInputTokens || 0;
    let cacheReadTokens = session.cacheReadInputTokens || 0;
    
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
    
    analysis.totalInputTokens += inputTokens;
    analysis.totalOutputTokens += outputTokens;
    analysis.totalCacheWriteTokens += cacheWriteTokens;
    analysis.totalCacheReadTokens += cacheReadTokens;
    analysis.totalCost += cost;
    
    // Track by model
    if (!analysis.byModel[fullModel]) {
      analysis.byModel[fullModel] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        sessions: 0
      };
    }
    
    analysis.byModel[fullModel].inputTokens += inputTokens;
    analysis.byModel[fullModel].outputTokens += outputTokens;
    analysis.byModel[fullModel].cacheWriteTokens += cacheWriteTokens;
    analysis.byModel[fullModel].cacheReadTokens += cacheReadTokens;
    analysis.byModel[fullModel].cost += cost;
    analysis.byModel[fullModel].sessions += 1;
    
    // Session details
    analysis.sessions.push({
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
  
  return analysis;
}

module.exports = {
  analyzeUsage,
  calculateCost,
  MODEL_PRICING
};
