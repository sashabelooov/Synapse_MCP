#!/usr/bin/env bash
set -e

echo "=== Mental Model MCP — Setup ==="

# 1. Python dependencies
echo "→ Installing Python dependencies..."
pip install -e ".[dev]" 2>/dev/null || pip install -e .

# 2. Frontend
echo "→ Installing frontend dependencies..."
cd web_ui/frontend
npm install

echo "→ Building frontend..."
npm run build
cd ../..

echo ""
echo "✅ Setup complete!"
echo ""
echo "To add to Claude Code (or any MCP-compatible agent), add to your mcp config:"
echo '  "mental-model": {'
echo '    "command": "python",'
echo '    "args": ["-m", "mcp_server.server"],'
echo "    \"cwd\": \"$(pwd)\""
echo '  }'
echo ""
echo "Or run manually:"
echo "  python -m mcp_server.server       # MCP server (stdio)"
echo "  python web_ui/server.py            # Web UI at http://127.0.0.1:7432"
