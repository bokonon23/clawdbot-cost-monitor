const fs = require('fs');
const path = require('path');
const os = require('os');

const CRON_JOBS_PATH = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');
const CRON_RUNS_DIR = path.join(os.homedir(), '.openclaw', 'cron', 'runs');
const AGENTS_DIR = path.join(os.homedir(), '.openclaw', 'agents');

function dayFromMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function buildDailyBreakdown(days = 7) {
  const now = Date.now();
  const start = now - days * 24 * 60 * 60 * 1000;

  const jobNameById = {};
  if (fs.existsSync(CRON_JOBS_PATH)) {
    try {
      const jobs = JSON.parse(fs.readFileSync(CRON_JOBS_PATH, 'utf8')).jobs || [];
      for (const j of jobs) jobNameById[j.id] = j.name || j.id;
    } catch (_) {}
  }

  const byDay = {};
  const ensure = (d) => {
    if (!byDay[d]) {
      byDay[d] = {
        date: d,
        cronByJob: {},
        agentsById: {}
      };
    }
    return byDay[d];
  };

  // Cron runs
  if (fs.existsSync(CRON_RUNS_DIR)) {
    for (const file of fs.readdirSync(CRON_RUNS_DIR)) {
      if (!file.endsWith('.jsonl')) continue;
      const jobId = file.replace(/\.jsonl$/, '');
      const jobName = jobNameById[jobId] || jobId;
      const p = path.join(CRON_RUNS_DIR, file);
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.action !== 'finished') continue;
        const ts = ev.runAtMs || ev.ts;
        if (!ts || ts < start) continue;
        const d = dayFromMs(ts);
        const day = ensure(d);
        if (!day.cronByJob[jobName]) day.cronByJob[jobName] = { input: 0, output: 0, runs: 0, errors: 0 };
        const rec = day.cronByJob[jobName];
        rec.runs += 1;
        if (ev.status !== 'ok') {
          rec.errors += 1;
          continue;
        }
        const u = ev.usage || {};
        rec.input += Number(u.input_tokens || 0);
        rec.output += Number(u.output_tokens || 0);
      }
    }
  }

  // Agent sessions (bots/agents)
  if (fs.existsSync(AGENTS_DIR)) {
    for (const agentId of fs.readdirSync(AGENTS_DIR)) {
      const sessionsDir = path.join(AGENTS_DIR, agentId, 'sessions');
      if (!fs.existsSync(sessionsDir)) continue;
      for (const file of fs.readdirSync(sessionsDir)) {
        if (!file.endsWith('.jsonl')) continue;
        const p = path.join(sessionsDir, file);
        for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
          if (!line.trim()) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          const msg = ev.message || null;
          if (!msg || !msg.usage) continue;
          const tsRaw = ev.timestamp;
          if (!tsRaw) continue;
          const ts = Date.parse(tsRaw);
          if (!ts || ts < start) continue;
          const d = dayFromMs(ts);
          const day = ensure(d);
          if (!day.agentsById[agentId]) day.agentsById[agentId] = { input: 0, output: 0, messages: 0 };
          const rec = day.agentsById[agentId];
          const u = msg.usage || {};
          rec.input += Number(u.input_tokens || u.input || 0);
          rec.output += Number(u.output_tokens || u.output || 0);
          rec.messages += 1;
        }
      }
    }
  }

  const out = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
    const cron = Object.entries(d.cronByJob)
      .map(([name, v]) => ({ name, ...v, total: v.input + v.output }))
      .sort((a, b) => b.total - a.total);

    const agents = Object.entries(d.agentsById)
      .map(([agent, v]) => ({ agent, ...v, total: v.input + v.output }))
      .sort((a, b) => b.total - a.total);

    const bots = agents.filter((a) => a.agent.endsWith('-bot'));

    return {
      date: d.date,
      cron,
      agents,
      bots,
      totals: {
        cronInput: cron.reduce((s, x) => s + x.input, 0),
        cronOutput: cron.reduce((s, x) => s + x.output, 0),
        agentInput: agents.reduce((s, x) => s + x.input, 0),
        agentOutput: agents.reduce((s, x) => s + x.output, 0)
      }
    };
  });

  return { days: out };
}

module.exports = { buildDailyBreakdown };
