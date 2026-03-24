const fs = require('fs');
const path = require('path');
const os = require('os');

const RUNS_DIR = path.join(os.homedir(), '.openclaw', 'cron', 'runs');
const SESSIONS_DIR = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions');
const CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

const WINDOW_MS = {
  '4h': 4 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

function loadAliases() {
  const aliases = {};
  try {
    if (!fs.existsSync(CONFIG_PATH)) return aliases;
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const models = (((cfg || {}).agents || {}).defaults || {}).models || {};
    for (const [fullModel, meta] of Object.entries(models)) {
      if (meta && typeof meta === 'object' && meta.alias) {
        aliases[fullModel] = meta.alias;
      }
    }
  } catch (_) {}
  return aliases;
}

function classifyError(text = '') {
  const t = String(text).toLowerCase();
  return {
    cooldown: /(cooldown|rate_limit|429|no available auth profile)/.test(t),
    timeout: /(timeout|timed out)/.test(t),
    auth: /(auth|401|forbidden|missing scopes|token)/.test(t)
  };
}

function normalizeModel(model, provider) {
  if (!model) return 'unknown';
  if (String(model).includes('/')) return model;
  if (provider) return `${provider}/${model}`;
  return model;
}

/**
 * Add a token count to the model buckets
 */
function addToBucket(modelBuckets, modelTotals, model, bucket, bucketCount, tokens) {
  if (!modelBuckets.has(model)) {
    modelBuckets.set(model, Array(bucketCount).fill(0));
    modelTotals.set(model, 0);
  }
  modelBuckets.get(model)[bucket] += tokens;
  modelTotals.set(model, modelTotals.get(model) + tokens);
}

/**
 * Scan cron run files for timeline data
 */
function scanCronRuns(from, now, bucketMs, bucketCount, modelBuckets, modelTotals, errors) {
  let totalRuns = 0;
  let errorRuns = 0;

  if (!fs.existsSync(RUNS_DIR)) return { totalRuns, errorRuns };

  const MAX_FILES = 500;
  const runFiles = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.jsonl')).slice(0, MAX_FILES);

  for (const file of runFiles) {
    const filePath = path.join(RUNS_DIR, file);
    let lines;
    try { lines = fs.readFileSync(filePath, 'utf8').split('\n'); } catch { continue; }

    for (const line of lines) {
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }

      if (ev.action !== 'finished') continue;
      const ts = ev.runAtMs || ev.ts;
      if (!ts || ts < from || ts > now) continue;

      const bucket = Math.floor((ts - from) / bucketMs);
      if (bucket < 0 || bucket >= bucketCount) continue;

      totalRuns += 1;

      if (ev.status !== 'ok') {
        errorRuns += 1;
        errors.all[bucket] += 1;
        const c = classifyError(ev.error || '');
        if (c.cooldown) errors.cooldown[bucket] += 1;
        if (c.timeout) errors.timeout[bucket] += 1;
        if (c.auth) errors.auth[bucket] += 1;
        continue;
      }

      const fullModel = normalizeModel(ev.model, ev.provider);
      const usage = ev.usage || {};
      const tokens = Number(
        usage.total_tokens || ((usage.input_tokens || 0) + (usage.output_tokens || 0))
      ) || 0;

      addToBucket(modelBuckets, modelTotals, fullModel, bucket, bucketCount, tokens);
    }
  }

  return { totalRuns, errorRuns };
}

/**
 * Scan interactive session JSONL files for timeline data
 * Looks for assistant messages with usage.totalTokens and a timestamp
 */
function scanSessions(from, now, bucketMs, bucketCount, modelBuckets, modelTotals) {
  let sessionMessages = 0;

  if (!fs.existsSync(SESSIONS_DIR)) return { sessionMessages };

  let sessionFiles;
  try {
    sessionFiles = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.jsonl') || f.includes('.jsonl.'));
  } catch { return { sessionMessages }; }

  // For performance: skip files not modified within the window (plus buffer)
  const cutoff = from - 3600000; // 1h buffer

  for (const file of sessionFiles) {
    const filePath = path.join(SESSIONS_DIR, file);

    // Skip files older than our window
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff && stat.size > 0) {
        // For 4h/24h windows, skip old files. For 7d/30d, check anyway if recent enough
        if ((now - from) <= 86400000 && stat.mtimeMs < cutoff) continue;
      }
    } catch { continue; }

    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; }

    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.includes('"usage"')) continue; // fast pre-filter
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }

      // Only process messages with usage data (assistant responses)
      if (ev.type !== 'message') continue;
      const msg = ev.message || ev;
      const usage = msg.usage;
      if (!usage) continue;

      const tsStr = ev.timestamp || msg.timestamp;
      if (!tsStr) continue;
      const ts = new Date(tsStr).getTime();
      if (isNaN(ts) || ts < from || ts > now) continue;

      const bucket = Math.floor((ts - from) / bucketMs);
      if (bucket < 0 || bucket >= bucketCount) continue;

      const model = msg.model || ev.model || 'unknown';
      const tokens = Number(usage.totalTokens || usage.total_tokens ||
        ((usage.input || 0) + (usage.output || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0))
      ) || 0;

      if (tokens > 0) {
        addToBucket(modelBuckets, modelTotals, model, bucket, bucketCount, tokens);
        sessionMessages += 1;
      }
    }
  }

  return { sessionMessages };
}

function buildTimeline(windowKey = '24h', bucketMinutes = 5) {
  const now = Date.now();
  const span = WINDOW_MS[windowKey] || WINDOW_MS['24h'];
  const from = now - span;
  const bucketMs = bucketMinutes * 60 * 1000;
  const bucketCount = Math.ceil(span / bucketMs);

  const labels = Array.from({ length: bucketCount }, (_, i) => {
    const ts = from + i * bucketMs;
    return new Date(ts).toISOString();
  });

  const modelBuckets = new Map();
  const modelTotals = new Map();
  const errors = {
    all: Array(bucketCount).fill(0),
    cooldown: Array(bucketCount).fill(0),
    timeout: Array(bucketCount).fill(0),
    auth: Array(bucketCount).fill(0)
  };

  // Scan both cron runs and interactive sessions
  const cronResult = scanCronRuns(from, now, bucketMs, bucketCount, modelBuckets, modelTotals, errors);
  const sessionResult = scanSessions(from, now, bucketMs, bucketCount, modelBuckets, modelTotals);

  const aliases = loadAliases();

  const models = Array.from(modelBuckets.entries())
    .map(([model, points]) => ({
      model,
      alias: aliases[model] || null,
      display: aliases[model] ? `${aliases[model]} (${model})` : model,
      points,
      totalTokens: modelTotals.get(model) || 0
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  return {
    labels,
    models,
    errors,
    meta: {
      from,
      to: now,
      totalRuns: cronResult.totalRuns,
      errorRuns: cronResult.errorRuns,
      sessionMessages: sessionResult.sessionMessages,
      bucketMinutes
    }
  };
}

module.exports = { buildTimeline, loadAliases };
