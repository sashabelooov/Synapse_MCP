# Synapse AI Architect — CLAUDE.md

This document describes the current state of the project for AI assistants (Claude, GPT-4o, etc.) working with this codebase.

---

## What This Project Is

**Synapse AI Architect** is a single-page web app where users describe a software system in natural language and the AI generates an interactive architecture diagram on a canvas. Users can then refine the diagram through further chat, manually drag/edit nodes, save multiple diagrams per project, and switch between AI models.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + TypeScript (`tsx` for dev) |
| Frontend | React + Vite + TypeScript |
| Diagram canvas | ReactFlow v11 (`reactflow` package) |
| Icons | `simple-icons` (brand logos) + `lucide-react` (system icons) |
| State | Zustand (theme only) |
| AI — Claude API | `@anthropic-ai/sdk` with `claude-sonnet-4-6` |
| AI — Claude CLI | `spawnSync('claude', [...])` subprocess |
| AI — OpenAI | `openai` SDK with `gpt-4o` |

---

## How to Run

```bash
# Install dependencies (first time)
npm install

# Start backend + frontend (runs concurrently)
npm run dev
```

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

API keys go in `.env` at the project root:
```
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

---

## How to Use the MCP Server with Claude Code CLI

The project exposes an **MCP (Model Context Protocol) server** at `src/mcp.ts`.

### Option 1: Add to your Claude Code MCP config

```bash
# From the project root
claude --mcp-config mcp.json
```

This registers the Synapse tools so Claude Code can call them directly from the terminal.

### Option 2: Start the MCP server standalone

```bash
npx tsx src/mcp.ts
```

The MCP server connects via stdio. Tools exposed:

| Tool | Description |
|------|-------------|
| `analyze_codebase` | Walk a local directory and return structure summary |
| `get_file` | Read a specific file |
| `search_code` | Grep-style search across the codebase |

These are available to any MCP-compatible client (Claude Code CLI, Claude Desktop, etc.).

---

## Core Logic: AI → Diagram Flow

1. User types a description in the chat panel (e.g. "a React app with PostgreSQL and Redis")
2. Frontend sends the full message history to `POST /api/architect/chat`
3. Backend runs the system prompt:
   - **Phase 1**: AI asks 1–2 clarifying questions (scale? cloud provider? which services?)
   - **Phase 2**: AI responds with a `<DIAGRAM>` JSON block embedded in the reply
4. Frontend parses the `<DIAGRAM>` block and renders it on the ReactFlow canvas
5. User can drag nodes, add/remove edges, rename labels directly on the canvas
6. Diagrams are saved as JSON files in `data/diagrams/`

### Diagram JSON schema

```json
{
  "title": "My System",
  "nodes": [
    { "id": "react", "label": "React App", "icon": "react", "nodeType": "frontend", "x": 100, "y": 100 }
  ],
  "edges": [
    { "id": "e1", "source": "react", "target": "api", "label": "REST", "style": "solid" }
  ],
  "groups": [
    { "id": "g1", "label": "Frontend", "x": 60, "y": 60, "width": 300, "height": 200, "color": "#58a6ff" }
  ]
}
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/architect/chat` | Send chat message, get AI reply + optional diagram |
| `POST` | `/api/architect/diagrams` | Save a diagram to disk |
| `GET` | `/api/architect/diagrams` | List all saved diagrams |
| `GET` | `/api/architect/diagrams/:id` | Load a specific diagram |
| `DELETE` | `/api/architect/diagrams/:id` | Delete a diagram |

### Chat request body
```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "model": "claude" | "claude-cli" | "openai"
}
```

### Chat response
```json
{
  "reply": "Here is the architecture...",
  "diagram": { ... }
}
```

---

## File Structure

```
synapse_mcp/
├── src/
│   ├── server.ts           # Express app entrypoint
│   ├── mcp.ts              # MCP server (for Claude Code CLI integration)
│   ├── api/
│   │   └── routes.ts       # All API routes (chat, diagrams CRUD)
│   ├── analyzer/           # Codebase analysis utilities
│   ├── graph/              # Graph traversal helpers
│   └── storage/            # File I/O helpers
├── data/
│   └── diagrams/           # Saved diagram JSON files
├── web_ui/frontend/
│   └── src/
│       ├── App.tsx                         # Renders ArchitectWorkspace only
│       ├── main.tsx                        # Sets dark theme, imports CSS
│       ├── index.css                       # CSS variables, dot grid, theme
│       ├── arch/
│       │   ├── types.ts                    # TypeScript interfaces
│       │   ├── icons.tsx                   # TechIcon component + icon map
│       │   └── DiagramCanvas.tsx           # ReactFlow canvas + custom nodes/edges
│       ├── components/
│       │   └── ArchitectWorkspace.tsx      # Main UI: chat panel, toolbar, canvas
│       └── store/
│           └── useStore.ts                 # Zustand store (theme toggle only)
├── .env                    # API keys (not committed)
├── mcp.json                # MCP config for claude --mcp-config
└── package.json
```

---

## AI Models Available in the UI

| Label | Model | How it works |
|-------|-------|-------------|
| `Claude API` | claude-sonnet-4-6 | Direct Anthropic SDK call |
| `Claude CLI` | claude-sonnet (latest) | `spawnSync` subprocess, stdin conversation |
| `GPT-4o` | gpt-4o | OpenAI SDK call |

Switch models using the model badge button in the top-right toolbar.

---

## What AI Can Do Here

- Generate multi-tier architecture diagrams from plain English descriptions
- Ask clarifying questions (scale, cloud provider, specific technologies)
- Produce groups/layers (Frontend, Backend, Infrastructure) with colored boundaries
- Label connections between services (REST, gRPC, pub/sub, etc.)
- Iteratively refine a diagram based on follow-up messages
- Output dashed edges for async/event-driven connections

## What AI Cannot Do (current limits)

- Auto-analyze an existing codebase and generate a diagram (planned, not implemented)
- Export diagrams to image/SVG (canvas only)
- Real-time collaboration
