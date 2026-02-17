#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║   💰 CLAWDBOT COST MONITOR - INSTALLER                         ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "   Please install Node.js 14+ from https://nodejs.org"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Check if OpenClaw/Clawdbot is installed
if command -v openclaw &> /dev/null; then
    echo "✅ OpenClaw found"
elif command -v clawdbot &> /dev/null; then
    echo "✅ Clawdbot (legacy) found"
else
    echo "⚠️  Warning: Neither openclaw nor clawdbot command found."
    echo "   This tool tracks OpenClaw/Clawdbot costs. Make sure one is installed."
    echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Installation complete!"
    echo ""
    echo "🚀 To start the dashboard:"
    echo "   npm start"
    echo ""
    echo "🛠️  To run as a macOS service (auto-start + restart on crash):"
    echo "   npm run service:install"
    echo ""
    echo "   Then open: http://localhost:3939"
    echo ""
else
    echo "❌ Installation failed. Please check the errors above."
    exit 1
fi
