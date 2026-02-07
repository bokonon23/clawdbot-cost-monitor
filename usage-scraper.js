#!/usr/bin/env node
/**
 * Scrapes Claude Code /usage data by spawning an interactive session,
 * running /usage, parsing the output, and immediately exiting.
 * 
 * Writes results to data/plan-usage.json
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(__dirname, 'data');
const USAGE_FILE = path.join(DATA_DIR, 'plan-usage.json');
const TIMEOUT_MS = 45000; // 45 second max

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function scrapeUsage() {
  return new Promise((resolve, reject) => {
    let output = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill('SIGKILL');
        reject(new Error('Timeout waiting for /usage output'));
      }
    }, TIMEOUT_MS);

    // Spawn claude with PTY via script command (macOS)
    const proc = spawn('script', ['-q', '/dev/null', 'claude'], {
      cwd: os.tmpdir(),
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();

      // Wait for the welcome screen to load, then send /usage
      if (output.includes('Welcome back') && !output.includes('/usage')) {
        setTimeout(() => {
          proc.stdin.write('/usage\n');
        }, 2000);
      }

      // Check if we have usage data
      if (output.includes('Current session') && output.includes('Current week')) {
        // Wait a moment for full render
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            // Send Escape then Ctrl+C to exit cleanly
            proc.stdin.write('\x1b');
            setTimeout(() => {
              proc.stdin.write('\x03');
              setTimeout(() => {
                proc.kill('SIGTERM');
                resolve(parseUsageOutput(output));
              }, 500);
            }, 500);
          }
        }, 2000);
      }
    });

    proc.stderr.on('data', (chunk) => {
      // Ignore stderr noise
    });

    proc.on('close', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        // Try to parse whatever we got
        const result = parseUsageOutput(output);
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Claude Code exited without usage data'));
        }
      }
    });

    // Handle the trust prompt - send Enter to accept
    setTimeout(() => {
      if (!resolved && output.includes('trust this folder')) {
        proc.stdin.write('\n');
      }
    }, 3000);
  });
}

function parseUsageOutput(raw) {
  // Strip ANSI escape codes
  const clean = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b\[[\?]?[0-9;]*[hlm]/g, '')
                    .replace(/\x1b/g, '');

  const result = {
    timestamp: new Date().toISOString(),
    session: null,
    weeklyAll: null,
    weeklySonnet: null
  };

  // Parse session usage: look for pattern like "7% used" after "Current session"
  const sessionMatch = clean.match(/Current session[^]*?(\d+)%\s*used[^]*?Resets?\s+([^\n]+)/i);
  if (sessionMatch) {
    result.session = {
      percentUsed: parseInt(sessionMatch[1]),
      resets: sessionMatch[2].trim().replace(/\s+/g, ' ')
    };
  }

  // Parse weekly all models
  const weeklyAllMatch = clean.match(/Current week \(all models\)[^]*?(\d+)%\s*used[^]*?Resets?\s+([^\n]+)/i);
  if (weeklyAllMatch) {
    result.weeklyAll = {
      percentUsed: parseInt(weeklyAllMatch[1]),
      resets: weeklyAllMatch[2].trim().replace(/\s+/g, ' ')
    };
  }

  // Parse weekly sonnet
  const weeklySonnetMatch = clean.match(/Current week \(Sonnet only\)[^]*?(\d+)%\s*used[^]*?Resets?\s+([^\n]+)/i);
  if (weeklySonnetMatch) {
    result.weeklySonnet = {
      percentUsed: parseInt(weeklySonnetMatch[1]),
      resets: weeklySonnetMatch[2].trim().replace(/\s+/g, ' ')
    };
  }

  return result;
}

async function main() {
  console.log('[' + new Date().toISOString() + '] Scraping Claude Code /usage...');
  
  try {
    const usage = await scrapeUsage();
    
    // Load existing history
    let history = [];
    if (fs.existsSync(USAGE_FILE)) {
      try {
        history = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
      } catch (e) {
        history = [];
      }
    }

    history.push(usage);

    // Keep last 90 days
    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
    history = history.filter(h => new Date(h.timestamp).getTime() > cutoff);

    fs.writeFileSync(USAGE_FILE, JSON.stringify(history, null, 2));
    
    console.log('Usage scraped successfully:');
    console.log('  Session: ' + (usage.session ? usage.session.percentUsed + '% used' : 'N/A'));
    console.log('  Weekly (all): ' + (usage.weeklyAll ? usage.weeklyAll.percentUsed + '% used' : 'N/A'));
    console.log('  Weekly (Sonnet): ' + (usage.weeklySonnet ? usage.weeklySonnet.percentUsed + '% used' : 'N/A'));
    
    // Output JSON for easy parsing
    console.log(JSON.stringify(usage));
    process.exit(0);
  } catch (error) {
    console.error('Error scraping usage:', error.message);
    process.exit(1);
  }
}

main();
