# 💰 Clawdbot Cost Monitor

**Track your Clawdbot AI spending in real-time. Never get surprised by API bills again.**

Unlike Claude's platform dashboard which only shows overall API usage, this gives you Clawdbot-specific insights with historical tracking and budget projections.

## The Problem

Clawdbot users have no idea what they're spending:
- "I've been using this for 2 days, spent $300+ on what felt like basic tasks" (Hacker News)
- "Is this going to cost me $10 or $150 this month?"
- Claude's dashboard shows API usage, but not Clawdbot-specific costs
- No way to predict monthly spending

## The Solution

A beautiful real-time dashboard with advanced analytics:

**📊 Real-Time Tracking:**
- ✅ Live cost updates (refreshes every 5 seconds)
- ✅ Total cost across all sessions
- ✅ Token usage breakdown (input/output)
- ✅ Cost by model (Claude, GPT, etc.)
- ✅ Per-session details

**📈 Historical Analytics:**
- ✅ 7-day cost history with charts
- ✅ Daily spending trends
- ✅ Visual graphs powered by Chart.js

**🎯 Budget Projections:**
- ✅ Monthly cost projection based on usage
- ✅ Daily burn rate calculation
- ✅ Budget alerts when exceeding $50/month
- ✅ "At this rate, you'll spend $X this month"

**🔄 Works Everywhere:**
- ✅ All AI providers (Anthropic, OpenAI, etc.)
- ✅ Multiple Clawdbot sessions
- ✅ Claude Pro users tracking API overflow

## Quick Start

```bash
# Install dependencies
cd clawdbot-cost-monitor
npm install

# Start the dashboard
npm start

# Open in your browser
# http://localhost:3939
```

## How It Works

1. Reads your Clawdbot session data from `~/.clawdbot/agents/main/sessions/sessions.json`
2. Calculates costs based on official model pricing
3. Displays everything in a clean, real-time dashboard
4. Updates automatically as you use Clawdbot

## Supported Models

- Claude Sonnet 4/4.5
- Claude Opus 4
- GPT-4/GPT-4 Turbo
- GPT-3.5 Turbo
- And more...

## Requirements

- Node.js 14+
- An active Clawdbot installation

## What's Next?

**v0.3 (Future):**
- Export to CSV
- Email/Telegram alerts
- Configurable budget limits (currently $50)
- Multi-agent comparison
- Cost optimization suggestions
- Historical data beyond 30 days

## Pricing

**Currently:** Free and open source

**Future:** Optional $5/month for cloud-hosted version with historical data

## Built By

[@0xboko](https://x.com/0xboko) at [Blockstrata](https://blockstrata.co)

Built with ❤️ for the Clawdbot community.

## License

MIT
