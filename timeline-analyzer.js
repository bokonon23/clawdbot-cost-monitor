const fs = require('fs');
const path = require('path');
const os = require('os');

const RUNS_DIR = path.join(os.homedir(), '.openclaw', 'cron', 'runs');
const CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

const WINDOW_MS = {
  '4h': 4 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
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

  let totalRuns = 0;
  let errorRuns = 0;

  if (!fs.existsSync(RUNS_DIR)) {
    return { labels, models: [], errors, meta: { from, to: now, totalRuns, errorRuns, bucketMinutes } };
  }

  for (const file of fs.readdirSync(RUNS_DIR)) {
    if (!file.endsWith('.jsonl')) continue;
    const filePath = path.join(RUNS_DIR, file);
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }

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

      if (!modelBuckets.has(fullModel)) {
        modelBuckets.set(fullModel, Array(bucketCount).fill(0));
        modelTotals.set(fullModel, 0);
      }
      modelBuckets.get(fullModel)[bucket] += tokens;
      modelTotals.set(fullModel, modelTotals.get(fullModel) + tokens);
    }
  }

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
      totalRuns,
      errorRuns,
      bucketMinutes
    }
  };
}

module.exports = { buildTimeline, loadAliases };
