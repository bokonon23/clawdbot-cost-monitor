const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Model pricing (per million tokens)
// Claude Code uses prompt caching which dramatically reduces costs
const MODEL_PRICING = {
  // Opus 4.5
  'claude-opus-4-5-20251101': {
    input: 15.00,
    output: 75.00,
    cacheWrite: 18.75,  // 25% premium for writing to cache
    cacheRead: 1.50     // 90% discount for reading from cache
  },
  // Sonnet 4.5
  'claude-sonnet-4-5-20251101': {
    input: 3.00,
    output: 15.00,
    cacheWrite: 3.75,
    cacheRead: 0.30
  },
  // Haiku 4.5
  'claude-haiku-4-5-20251001': {
    input: 0.80,
    output: 4.00,
    cacheWrite: 1.00,
    cacheRead: 0.08
  },
  // Legacy model names (anthropic/ prefix)
  'anthropic/claude-opus-4-5': {
    input: 15.00,
    output: 75.00,
    cacheWrite: 18.75,
    cacheRead: 1.50
  },
  'anthropic/claude-sonnet-4-5': {
    input: 3.00,
    output: 15.00,
    cacheWrite: 3.75,
    cacheRead: 0.30
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
  // Gemini
  'google/gemini-2.5-flash': {
    input: 0.30,
    output: 2.50,
    cacheWrite: 0,
    cacheRead: 0
  },
  'openai/gpt-4': { input: 30.00, output: 60.00, cacheWrite: 0, cacheRead: 0 },
  'openai/gpt-4-turbo': { input: 10.00, output: 30.00, cacheWrite: 0, cacheRead: 0 },
  'openai/gpt-3.5-turbo': { input: 0.50, output: 1.50, cacheWrite: 0, cacheRead: 0 },
};

// Default pricing for unknown models (assume Sonnet-class)
const DEFAULT_PRICING = {
  input: 3.00,
  output: 15.00,
  cacheWrite: 3.75,
  cacheRead: 0.30
};

/**
 * Get all candidate session directory paths
 * Searches both old (.clawdbot) and new (.openclaw) paths after the rename,
 * plus the Claude Code projects path as a fallback.
 */
function getSessionSearchPaths() {
  return [
    path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions'),
    path.join(os.homedir(), '.clawdbot', 'agents', 'main', 'sessions'),
    path.join(os.homedir(), '.claude', 'projects'),
  ];
}

function resolveBaseSafe(baseDir, childName) {
  if (path.isAbsolute(childName) || childName.includes('\0')) {
    throw new Error('Unsafe path segment');
  }
  const baseResolved = path.resolve(baseDir);
  const candidate = path.resolve(baseResolved, childName);
  if (!(candidate === baseResolved || candidate.startsWith(baseResolved + path.sep))) {
    throw new Error('Path traversal attempt blocked');
  }
  return candidate;
}

function isPathInAllowedRoots(targetPath, roots) {
  const targetResolved = path.resolve(targetPath);
  return roots.some((root) => {
    const rootResolved = path.resolve(root);
    return targetResolved === rootResolved || targetResolved.startsWith(rootResolved + path.sep);
  });
}

/**
 * Recursively find all JSONL files in a directory
 */
function findJsonlFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      let fullPath;
      try {
        fullPath = resolveBaseSafe(dir, entry.name);
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...findJsonlFiles(fullPath));
      } else if (entry.name.endsWith('.jsonl')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error('Error reading directory:', dir, error.message);
  }
  return files;
}

/**
 * Parse a single JSONL file and extract usage data from all messages
 */
async function parseJsonlFile(filePath) {
  const results = {
    sessionId: path.basename(filePath, '.jsonl'),
    filePath: filePath,
    messages: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheWriteTokens: 0,
    totalCacheReadTokens: 0,
    messageCount: 0,
    models: new Set(),
    firstTimestamp: null,
    lastTimestamp: null
  };

  const allowedRoots = getSessionSearchPaths();
  if (!isPathInAllowedRoots(filePath, allowedRoots)) {
    console.error('Refusing to read path outside allowed roots:', filePath);
    return results;
  }

  try {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      try {
        const entry = JSON.parse(line);

        // Process messages with usage data
        // Handle both OpenClaw format (type: "message") and Claude Code format (type: "assistant")
        const isOpenClawMessage = entry.type === 'message' && entry.message && entry.message.usage;
        const isClaudeCodeMessage = entry.type === 'assistant' && entry.message && entry.message.usage;

        if (isOpenClawMessage || isClaudeCodeMessage) {
          const usage = entry.message.usage;
          const model = entry.message.model || 'unknown';
          const timestamp = entry.timestamp ? new Date(entry.timestamp) : null;

          results.models.add(model);
          results.messageCount++;

          // Handle both formats:
          // OpenClaw: usage.input, usage.output, usage.cacheRead, usage.cacheWrite
          // Claude Code: usage.input_tokens, usage.output_tokens, usage.cache_read_input_tokens, usage.cache_creation_input_tokens
          const inputTokens = usage.input_tokens || usage.input || 0;
          const outputTokens = usage.output_tokens || usage.output || 0;
          const cacheWriteTokens = usage.cache_creation_input_tokens || usage.cacheWrite || 0;
          const cacheReadTokens = usage.cache_read_input_tokens || usage.cacheRead || 0;

          // OpenClaw pre-calculates cost - use it if available
          const preCalculatedCost = usage.cost && usage.cost.total ? usage.cost.total : null;

          results.totalInputTokens += inputTokens;
          results.totalOutputTokens += outputTokens;
          results.totalCacheWriteTokens += cacheWriteTokens;
          results.totalCacheReadTokens += cacheReadTokens;

          // Track timestamps
          if (timestamp) {
            if (!results.firstTimestamp || timestamp < results.firstTimestamp) {
              results.firstTimestamp = timestamp;
            }
            if (!results.lastTimestamp || timestamp > results.lastTimestamp) {
              results.lastTimestamp = timestamp;
            }
          }

          // Store message-level data for detailed tracking
          results.messages.push({
            model,
            timestamp: timestamp ? timestamp.toISOString() : null,
            inputTokens,
            outputTokens,
            cacheWriteTokens,
            cacheReadTokens,
            preCalculatedCost  // Use OpenClaw's pre-calculated cost if available
          });
        }
      } catch (e) {
        // Skip malformed lines
      }
    }
  } catch (error) {
    console.error('Error parsing JSONL file:', filePath, error.message);
  }

  return results;
}

/**
 * Calculate cost for a given token breakdown and model
 */
function calculateCost(tokenBreakdown, model) {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;

  const inputCost = (tokenBreakdown.input / 1_000_000) * pricing.input;
  const outputCost = (tokenBreakdown.output / 1_000_000) * pricing.output;

  let cacheWriteCost = 0;
  let cacheReadCost = 0;

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

/**
 * Analyze all OpenClaw/Claude Code usage from JSONL files
 */
async function analyzeUsage() {
  // Search all candidate paths: .openclaw (new), .clawdbot (legacy), .claude (fallback)
  const searchPaths = getSessionSearchPaths();

  let jsonlFiles = [];
  const seenFiles = new Set();
  const sourcePaths = [];

  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      const found = findJsonlFiles(searchPath);
      for (const f of found) {
        if (!seenFiles.has(f)) {
          seenFiles.add(f);
          jsonlFiles.push(f);
        }
      }
      if (found.length > 0) {
        sourcePaths.push(searchPath);
      }
    }
  }

  const sourcePath = sourcePaths[0] || '';

  if (jsonlFiles.length === 0) {
    return { error: 'No session files found. Check ~/.openclaw/agents/main/sessions/, ~/.clawdbot/agents/main/sessions/, or ~/.claude/projects/' };
  }

  // Parse all JSONL files
  const allSessions = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCost = 0;
  const byModel = {};
  const byDay = {};

  for (const file of jsonlFiles) {
    const sessionData = await parseJsonlFile(file);

    if (sessionData.messageCount === 0) continue;

    // Calculate cost for this session by model
    let sessionCost = 0;
    const sessionByModel = {};

    for (const msg of sessionData.messages) {
      // Use pre-calculated cost from OpenClaw if available, otherwise calculate
      let msgCost;
      if (msg.preCalculatedCost !== null && msg.preCalculatedCost !== undefined) {
        msgCost = msg.preCalculatedCost;
      } else {
        const tokenBreakdown = {
          input: msg.inputTokens,
          output: msg.outputTokens,
          cacheWrite: msg.cacheWriteTokens,
          cacheRead: msg.cacheReadTokens
        };
        const costResult = calculateCost(tokenBreakdown, msg.model);
        msgCost = costResult.total;
      }
      sessionCost += msgCost;

      // Aggregate by model
      if (!sessionByModel[msg.model]) {
        sessionByModel[msg.model] = {
          inputTokens: 0,
          outputTokens: 0,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          cost: 0,
          messageCount: 0
        };
      }
      sessionByModel[msg.model].inputTokens += msg.inputTokens;
      sessionByModel[msg.model].outputTokens += msg.outputTokens;
      sessionByModel[msg.model].cacheWriteTokens += msg.cacheWriteTokens;
      sessionByModel[msg.model].cacheReadTokens += msg.cacheReadTokens;
      sessionByModel[msg.model].cost += msgCost;
      sessionByModel[msg.model].messageCount++;

      // Aggregate by day
      if (msg.timestamp) {
        const day = msg.timestamp.split('T')[0];
        if (!byDay[day]) {
          byDay[day] = {
            inputTokens: 0,
            outputTokens: 0,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
            cost: 0,
            messageCount: 0
          };
        }
        byDay[day].inputTokens += msg.inputTokens;
        byDay[day].outputTokens += msg.outputTokens;
        byDay[day].cacheWriteTokens += msg.cacheWriteTokens;
        byDay[day].cacheReadTokens += msg.cacheReadTokens;
        byDay[day].cost += msgCost;
        byDay[day].messageCount++;
      }
    }

    // Merge session model data into global
    for (const [model, data] of Object.entries(sessionByModel)) {
      if (!byModel[model]) {
        byModel[model] = {
          inputTokens: 0,
          outputTokens: 0,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          cost: 0,
          sessions: 0,
          messageCount: 0
        };
      }
      byModel[model].inputTokens += data.inputTokens;
      byModel[model].outputTokens += data.outputTokens;
      byModel[model].cacheWriteTokens += data.cacheWriteTokens;
      byModel[model].cacheReadTokens += data.cacheReadTokens;
      byModel[model].cost += data.cost;
      byModel[model].messageCount += data.messageCount;
      byModel[model].sessions++;
    }

    // Add to totals
    totalInputTokens += sessionData.totalInputTokens;
    totalOutputTokens += sessionData.totalOutputTokens;
    totalCacheWriteTokens += sessionData.totalCacheWriteTokens;
    totalCacheReadTokens += sessionData.totalCacheReadTokens;
    totalCost += sessionCost;

    // Store session summary
    allSessions.push({
      key: sessionData.sessionId,
      filePath: sessionData.filePath,
      models: [...sessionData.models],
      inputTokens: sessionData.totalInputTokens,
      outputTokens: sessionData.totalOutputTokens,
      cacheWriteTokens: sessionData.totalCacheWriteTokens,
      cacheReadTokens: sessionData.totalCacheReadTokens,
      cost: sessionCost,
      messageCount: sessionData.messageCount,
      firstTimestamp: sessionData.firstTimestamp ? sessionData.firstTimestamp.toISOString() : null,
      lastTimestamp: sessionData.lastTimestamp ? sessionData.lastTimestamp.toISOString() : null
    });
  }

  // Calculate savings from caching
  let costWithoutCaching = 0;
  for (const [model, data] of Object.entries(byModel)) {
    const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
    const allInputTokens = data.inputTokens + data.cacheWriteTokens + data.cacheReadTokens;
    costWithoutCaching += (allInputTokens / 1_000_000) * pricing.input;
    costWithoutCaching += (data.outputTokens / 1_000_000) * pricing.output;
  }
  const cachingSavings = costWithoutCaching - totalCost;

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheWriteTokens,
    totalCacheReadTokens,
    totalCost,
    costWithoutCaching,
    cachingSavings,
    byModel,
    byDay,
    sessions: allSessions,
    metadata: {
      sourcePath: sourcePath,
      jsonlFilesFound: jsonlFiles.length,
      sessionsWithData: allSessions.length,
      totalMessages: allSessions.reduce((sum, s) => sum + s.messageCount, 0),
      lastUpdate: new Date().toISOString()
    }
  };
}

module.exports = {
  analyzeUsage,
  calculateCost,
  MODEL_PRICING,
  findJsonlFiles,
  parseJsonlFile
};
