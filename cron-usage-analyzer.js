const fs = require('fs');
const path = require('path');
const os = require('os');

const CRON_JOBS_PATH = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');
const CRON_RUNS_DIR = path.join(os.homedir(), '.openclaw', 'cron', 'runs');

const LEGACY_NAME_MAP = {
  'ec0081d8-1ba7-4836-8170-5ff9891a663a': 'marketplace-check',
  '590ae345-42c8-4873-9197-e3ad6ece2784': 'parcel-tracking-sync',
  '3468816c-9dc4-4aea-90cf-921271a62a44': 'macrumors-daily-summary',
  '024bb70d-f297-4802-9ce8-e848c501c1cc': 'engadget-daily-summary',
  '57fd866d-d415-4c1e-b6d9-804bb9e5bc64': 'robin-newsletter-summary',
  'c4ff1a2f-38ee-4771-acb0-4dc42746b750': 'bins-reminder'
};

function analyzeCronUsage(days = 2) {
  const now = Date.now();
  const dailyStart = now - days * 24 * 60 * 60 * 1000;
  const hourlyStart = now - 24 * 60 * 60 * 1000;

  const nameById = { ...LEGACY_NAME_MAP };
  if (fs.existsSync(CRON_JOBS_PATH)) {
    try {
      const jobs = JSON.parse(fs.readFileSync(CRON_JOBS_PATH, 'utf8')).jobs || [];
      for (const j of jobs) nameById[j.id] = j.name || j.id;
    } catch (_) {}
  }

  const daily = {}; // day -> cron -> stats
  const hourly = {}; // cron -> hour -> stats

  if (!fs.existsSync(CRON_RUNS_DIR)) return { days: [], hourlyByCron: {} };

  const MAX_FILES = 200;
  const files = fs.readdirSync(CRON_RUNS_DIR).filter(f => f.endsWith('.jsonl')).slice(0, MAX_FILES);

  for (const file of files) {
    const jobId = file.replace(/\.jsonl$/, '');
    const cronName = nameById[jobId] || jobId;
    let lines;
    try { lines = fs.readFileSync(path.join(CRON_RUNS_DIR, file), 'utf8').split('\n'); } catch { continue; }

    for (const line of lines) {
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.action !== 'finished') continue;
      const ts = ev.runAtMs || ev.ts;
      if (!ts) continue;

      if (ts >= dailyStart) {
        const day = new Date(ts).toISOString().slice(0, 10);
        daily[day] ||= {};
        daily[day][cronName] ||= { input: 0, output: 0, runs: 0, errors: 0 };
        const rec = daily[day][cronName];
        rec.runs += 1;
        if (ev.status !== 'ok') rec.errors += 1;
        else {
          const u = ev.usage || {};
          rec.input += Number(u.input_tokens || 0);
          rec.output += Number(u.output_tokens || 0);
        }
      }

      if (ts >= hourlyStart) {
        const hour = new Date(ts).toISOString().slice(0, 13) + ':00';
        hourly[cronName] ||= {};
        hourly[cronName][hour] ||= { input: 0, output: 0, runs: 0, errors: 0 };
        const rec = hourly[cronName][hour];
        rec.runs += 1;
        if (ev.status !== 'ok') rec.errors += 1;
        else {
          const u = ev.usage || {};
          rec.input += Number(u.input_tokens || 0);
          rec.output += Number(u.output_tokens || 0);
        }
      }
    }
  }

  const dayRows = Object.keys(daily).sort().map((day) => {
    const crons = Object.entries(daily[day]).map(([name, s]) => ({
      name,
      ...s,
      total: s.input + s.output
    })).sort((a, b) => b.total - a.total);

    return {
      day,
      crons,
      totals: {
        input: crons.reduce((n, c) => n + c.input, 0),
        output: crons.reduce((n, c) => n + c.output, 0),
        runs: crons.reduce((n, c) => n + c.runs, 0),
        errors: crons.reduce((n, c) => n + c.errors, 0)
      }
    };
  });

  const hourlyByCron = {};
  for (const [cron, hoursObj] of Object.entries(hourly)) {
    const rows = Object.entries(hoursObj)
      .map(([hour, s]) => ({ hour, ...s, total: s.input + s.output }))
      .filter((r) => r.total > 0 || r.errors > 0)
      .sort((a, b) => a.hour.localeCompare(b.hour));
    if (rows.length) hourlyByCron[cron] = rows;
  }

  return { days: dayRows, hourlyByCron };
}

module.exports = { analyzeCronUsage };
