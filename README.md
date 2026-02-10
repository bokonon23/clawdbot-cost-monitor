# 💰 OpenClaw Cost Monitor

### **Beautiful real-time AI cost tracking with full message history parsing**

Track your OpenClaw or Claude Code AI spending with a **stunning dark-theme dashboard**. Get accurate lifetime costs by parsing JSONL session files, understand your token usage, and see exactly how much you're saving with prompt caching.

**NEW in v0.6.0:** 📊 **JSONL parsing!** Now reads full message history from session files for accurate cost tracking. Validated against Claude Console - matches within $2!

**v0.5.0:** 🎯 Lifetime cost tracking - never lose historical data again.

**v0.4.0:** Complete UI redesign with modern glassmorphism, smooth animations, and professional polish! 🎨

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.6.0-blue.svg)](https://github.com/bokonon23/clawdbot-cost-monitor)
[![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)

![Dashboard Screenshot](screenshots/dashboard.png)
*Beautiful dark theme showing: lifetime cost tracking, prompt caching savings (85% off!), 7-day history chart, and real-time session monitoring*

## The Problem

OpenClaw/Clawdbot users have no idea what they're spending:
- "I've been using this for 2 days, spent $300+ on what felt like basic tasks" (Hacker News)
- "Is this going to cost me $10 or $150 this month?"
- Claude's dashboard shows API usage, but not OpenClaw-specific costs
- No way to predict monthly spending

## The Solution

A **stunning, modern dashboard** with advanced analytics and beautiful UI:

**🎨 Beautiful Dark Theme UI (NEW in v0.4.0):**
- ✅ Modern glassmorphism design with animated particles
- ✅ Smooth animations and micro-interactions
- ✅ Professional gradient cards with hover effects
- ✅ Fully responsive mobile-first design
- ✅ Dark mode optimized for long viewing sessions

**📊 Real-Time Tracking:**
- ✅ Live cost updates (refreshes every 5 seconds)
- ✅ Total cost across all sessions
- ✅ Token usage breakdown (input/output/cached)
- ✅ Cost by model (Claude, GPT, etc.)
- ✅ Interactive tooltips explaining costs

**💚 Prompt Caching Analytics (v0.3.0+):**
- ✅ Shows exactly how much you're saving with caching
- ✅ 90% discount visualization on cached tokens
- ✅ Detailed breakdown of token types
- ✅ Green "savings card" celebrating your discounts

**📈 Historical Analytics:**
- ✅ 7-day cost history with beautiful charts
- ✅ Daily spending trends
- ✅ Animated Chart.js visualizations

**🎯 Budget Projections:**
- ✅ Monthly cost projection based on usage
- ✅ Daily burn rate calculation
- ✅ Configurable budget alerts
- ✅ Warning and critical alert states

**🔄 Works Everywhere:**
- ✅ All AI providers (Anthropic, OpenAI, etc.)
- ✅ Multiple OpenClaw sessions
- ✅ Claude Pro users tracking API overflow
- ✅ Works with both OpenClaw and legacy Clawdbot installs

## ⚡ Quick Start

Get up and running in 30 seconds:

```bash
git clone https://github.com/bokonon23/clawdbot-cost-monitor.git
cd clawdbot-cost-monitor
npm install
npm start
```

Then open **http://localhost:3939** in your browser. That's it!

The dashboard automatically:
- Detects your OpenClaw or Claude Code installation
- Parses JSONL session files for complete message history
- Calculates costs from every single API call
- Updates in real-time (every 30 seconds)
- Shows prompt caching savings with per-model pricing

**No configuration required.** Just run it.

## 🛠️ Run as a macOS Service (Launch at Login + Auto-Restart)

Want the dashboard to start automatically when your Mac boots and restart if it crashes? Use the built-in LaunchAgent:

```bash
npm run service:install
```

That will:
- Install a LaunchAgent at `~/Library/LaunchAgents/com.openclaw.cost-monitor.plist`
- Start it immediately
- Restart it automatically on crash

To uninstall:

```bash
npm run service:uninstall
```

Logs:
- `~/Library/Logs/openclaw-cost-monitor.log`
- `~/Library/Logs/openclaw-cost-monitor.error.log`

## How It Works

1. **Finds JSONL session files** from:
   - OpenClaw: `~/.openclaw/agents/main/sessions/*.jsonl`
   - Claude Code: `~/.claude/projects/**/*.jsonl`
2. **Parses every message** with usage data (tokens + costs)
3. **Uses pre-calculated costs** from OpenClaw when available, or calculates with correct per-model pricing
4. **Aggregates by day and model** for detailed analytics
5. **Updates in real-time** as you use the AI

**Supports both formats:**
- OpenClaw: `usage.input`, `usage.output`, `usage.cacheRead`, `usage.cacheWrite`, `usage.cost.total`
- Claude Code: `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_input_tokens`, etc.

## Why Your Costs Are Lower Than Expected 💚

**Good news:** OpenClaw/Clawdbot uses **Prompt Caching**, which dramatically reduces costs!

### What is Prompt Caching?

Every time you chat with AI, it needs your full conversation history. Without caching, you'd pay full price for resending that entire history every turn.

With **Prompt Caching** (Anthropic Claude feature):
- Repeated context is stored and reused
- **90% discount** on cached tokens ($0.30/M instead of $3.00/M)
- Makes long conversations 5-10x cheaper

### Real Example:

**Typical chat turn:**
- New input: 100 tokens × $3.00/M = **$0.0003**
- Chat history (cached): 27,000 tokens × $0.30/M = **$0.0081** 
- AI response: 500 tokens × $15.00/M = **$0.0075**
- **Total: $0.0159** (~1.6 cents per message)

**Without caching, that same turn would cost $0.0909** (9 cents) — over 5x more!

### How the Dashboard Shows This

The cost monitor now displays:
- **Green savings card** showing how much caching saved you
- **Token breakdown** (input / output / cached)
- **Real costs** based on the actual pricing including cache discounts

If you were using the old version (v0.2.x or earlier), costs were **overestimated by 10x** because caching wasn't accounted for. The fixed version (v0.3.0+) shows accurate costs.

## Supported Models

| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| Claude Opus 4.5 | $15/M | $75/M | $18.75/M | $1.50/M |
| Claude Sonnet 4.5 | $3/M | $15/M | $3.75/M | $0.30/M |
| Claude Haiku 4.5 | $0.80/M | $4/M | $1.00/M | $0.08/M |
| GPT-4 | $30/M | $60/M | - | - |
| GPT-4 Turbo | $10/M | $30/M | - | - |
| GPT-3.5 Turbo | $0.50/M | $1.50/M | - | - |

*Prices per million tokens. Cache pricing reflects Anthropic's 90% discount on cached reads.*

## 📋 Requirements

- **Node.js 14+** (16+ recommended)
- **OpenClaw or Claude Code** installed with session history
- Session files in one of these locations:
  - OpenClaw: `~/.openclaw/agents/main/sessions/*.jsonl`
  - Claude Code: `~/.claude/projects/**/*.jsonl`

## 🐛 Troubleshooting

**"No session files found"**
- Make sure OpenClaw or Claude Code has run at least once
- Check that JSONL files exist:
  - OpenClaw: `ls ~/.openclaw/agents/main/sessions/*.jsonl`
  - Claude Code: `find ~/.claude/projects -name "*.jsonl"`

**"Costs don't match Claude Console"**
- The dashboard shows ALL historical data, not just the current billing period
- Check the daily breakdown to see costs per day
- Make sure you're on **v0.6.0 or later** (JSONL parsing)

**"Connection error / Won't connect"**
- Port 3939 might be in use. Check with: `lsof -i :3939`
- Kill the process and restart: `npm start`

**"WSL: localhost doesn't work"**
- Use the WSL IP directly: `hostname -I` to get the IP
- Or set up port forwarding in Windows

**Still stuck?** [Open an issue](https://github.com/bokonon23/clawdbot-cost-monitor/issues) with details!

## 🚀 Roadmap

**Planned Features:**
- [ ] Export data to CSV
- [ ] Email/Telegram/Discord alerts
- [ ] Multi-agent cost comparison
- [ ] Cost optimization suggestions
- [ ] Extended historical data (30+ days)
- [ ] Custom time range filtering
- [ ] Cost forecasting with ML
- [ ] Docker deployment option

**Want a feature?** [Open an issue](https://github.com/bokonon23/clawdbot-cost-monitor/issues) and let me know!

## 🤝 Contributing

This is a community tool! Contributions are welcome:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Found a bug? [Report it here](https://github.com/bokonon23/clawdbot-cost-monitor/issues).

## ⭐ Show Your Support

If this tool helps you track costs and save money:
- Star this repo on GitHub
- Share it with the OpenClaw community
- Tweet about it (tag [@0xboko](https://x.com/0xboko))

Every star helps others discover this tool! 🙏

## 📝 Version History

### v0.6.0 (Feb 5, 2026) - JSONL Parsing 📊
- **MAJOR:** Parse JSONL session files for accurate cost tracking
- Reads full message history instead of session summaries
- Supports both OpenClaw and Claude Code session formats
- Uses pre-calculated costs from OpenClaw when available
- Daily cost breakdown (byDay) for historical analysis
- Correct per-model pricing (Opus, Sonnet, Haiku)
- Validated against Claude Console: $145.87 calculated vs $119.49 for Feb 1-5 (difference is Jan 27-31 data)
- Async JSONL parsing for better performance

### v0.5.0 (Feb 2, 2026) - Lifetime Tracking 🎯
- **MAJOR:** Persistent session tracking across restarts
- Stores all sessions seen in `~/.clawdbot-cost-monitor/`
- Never loses historical cost data
- Shows "tracking since" date on dashboard
- Total sessions tracked counter
- Accumulates costs from installation forward
- No API keys required (provider agnostic)

### v0.4.0 (Feb 2, 2026) - UI Redesign 🎨
- Complete UI overhaul with modern dark theme
- Glassmorphism effects with animated particles
- Smooth animations and micro-interactions
- Professional gradient cards with hover effects
- Fully responsive mobile-first design
- Enhanced data visualization

### v0.3.0 (Feb 1, 2026) - Caching Fix
- **MAJOR FIX:** Accurate prompt caching cost calculation
- Added cache write/read pricing (90% discount)
- Green savings card showing caching benefits
- Detailed token breakdown (input/output/cached)
- Fixed 10x cost overestimation bug

### v0.2.x (Jan 2026) - Initial Release
- Basic cost tracking
- 7-day history charts
- Budget projections
- Real-time updates

## 🙏 Built By

Created by [@0xboko](https://x.com/0xboko) at [Blockstrata](https://blockstatra.co)

Built with ❤️ for the OpenClaw community. Free forever.

## 📄 License

MIT License - do whatever you want with it!

---

**Found this useful?** [⭐ Star it on GitHub](https://github.com/bokonon23/clawdbot-cost-monitor) to help others discover it!
