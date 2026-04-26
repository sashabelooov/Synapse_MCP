# Synapse MCP — Project Documentation

## What Is Synapse MCP?

Synapse MCP is a **code intelligence visualizer** for Python backend projects. It statically analyzes a project directory (FastAPI, Django, or generic Python) and builds an interactive visual mental model: file trees, call graphs, DB schema, HTTP routes, DevOps topology, and an execution debugger — all in a modern dark/light UI served locally.

It also exposes an **MCP (Model Context Protocol) server** so AI assistants can query the same analysis data programmatically.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        User Browser                          │
│              React + TypeScript + Tailwind UI                │
│    (Project Tree · Call Graph · DB Schema · Routes ·         │
│                 DevOps · Execution Debugger)                 │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTP REST  (port 7432)
┌─────────────────────────▼────────────────────────────────────┐
│                   FastAPI Web Server                         │
│            web_ui/server.py  +  web_ui/routes.py             │
│      Serves built frontend + proxies API to MCP tools        │
└──────┬───────────────────────────────────────────────────────┘
       │ Python function calls
┌──────▼───────────────────────────────────────────────────────┐
│                    MCP Server Core                           │
│              mcp_server/  (fastmcp library)                  │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │  Analyzers  │  │    Graph     │  │    Storage       │    │
│  │  base.py    │  │  builder.py  │  │  database.py     │    │
│  │  ast_parser │  │              │  │  SQLite per-proj │    │
│  │  fastapi_   │  │  call graph  │  │                  │    │
│  │  django_    │  │  db graph    │  │                  │    │
│  │  devops_    │  │              │  │                  │    │
│  └─────────────┘  └──────────────┘  └──────────────────┘    │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐                          │
│  │    Tools    │  │   Tracers    │                          │
│  │  analyze.py │  │ dynamic_     │                          │
│  │  query.py   │  │ tracer.py    │                          │
│  │  tracer_    │  │ trace_script │                          │
│  │  ui_tool.py │  │              │                          │
│  └─────────────┘  └──────────────┘                          │
└──────────────────────────────────────────────────────────────┘
       │ writes/reads
┌──────▼───────────────────────────────────────────────────────┐
│           SQLite Database  (per project)                     │
│     <project_root>/.mcp_mental_model/db.sqlite               │
│                                                              │
│  tables: projects · files · functions · calls ·              │
│          db_models · routes · execution_traces               │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Analyze → View

```
User enters /path/to/project
         │
         ▼
POST /api/analyze
         │
         ▼
┌─────────────────────────────────────┐
│  1. detect_framework()              │
│     Look for manage.py → Django     │
│     Look for FastAPI in .py → FastAPI│
│     Else → unknown                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  2. collect_python_files()          │
│     rglob("*.py")                   │
│     Skip: .git, __pycache__, venv,  │
│     node_modules, migrations, dist  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  3. parse_file() per .py file       │
│     AST walk → FileInfo:            │
│     - functions (name, line, args)  │
│     - calls (caller → callee)       │
│     - imports                       │
│     - file_role (router/model/etc.) │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  4. Framework-specific analyzers    │
│                                     │
│  FastAPI:  extract @app.get/post    │
│            route path, method, tags │
│            handler function ref     │
│                                     │
│  Django:   extract urlpatterns      │
│            Model field definitions  │
│            ForeignKey/M2M relations │
│                                     │
│  DevOps:   scan Dockerfile,         │
│            docker-compose.yml,      │
│            .github/workflows/*.yml, │
│            k8s/*.yaml, .env files   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  5. Persist to SQLite               │
│     INSERT projects, files,         │
│     functions, calls, db_models,    │
│     routes, execution_traces        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  6. Return stats to frontend        │
│     { ok, stats: {                  │
│         files, functions, routes,   │
│         db_models, devops_files     │
│       }, framework }                │
└─────────────────────────────────────┘
```

---

## Frontend Views

### 1. Project Tree
- Hierarchical file/folder tree with branded SVG icons (Python, Docker, GitHub, Postgres)
- Draggable nodes on an SVG canvas
- Zoom via scroll wheel (viewBox manipulation)
- Pan via drag on empty canvas
- Direction toggle: Top-to-Bottom / Left-to-Right
- File role color-coded pills (router, model, service, test, config, util)
- Dark dot-grid background

### 2. Call Graph
- Interactive graph of function calls across the project
- Nodes = functions; edges = calls
- Filter by starting function (subgraph traversal, max depth 6)
- Built with React Flow

### 3. DB Schema
- Visual ER-style diagram of database models
- Fields with types
- ForeignKey / ManyToMany relationship edges
- Supports Django ORM models

### 4. Routes
- Table of all HTTP routes (method, path, handler, tags)
- FastAPI decorator extraction
- Django urlpatterns extraction

### 5. DevOps
- Visual topology of infrastructure files
- Nodes for: Dockerfile, docker-compose services, GitHub Actions workflows, K8s manifests, env files
- Edge relationships (service → image, workflow → job)

### 6. Execution Debugger
- Dynamic runtime tracing
- Injects a tracer script into the target project
- Captures actual function call order and arguments at runtime
- Displays execution timeline

---

## File Structure

```
synapse_mcp/
├── mcp_server/
│   ├── __init__.py
│   ├── config.py              # DB path helpers
│   ├── storage/
│   │   └── database.py        # SQLite async (aiosqlite)
│   ├── analyzers/
│   │   ├── base.py            # File walker, framework detector, tree builder
│   │   ├── ast_parser.py      # Python AST → FileInfo
│   │   ├── fastapi_analyzer.py
│   │   ├── django_analyzer.py
│   │   └── devops_analyzer.py
│   ├── graph/
│   │   └── builder.py         # call graph + db graph node/edge format
│   ├── tools/
│   │   ├── analyze.py         # analyze_project tool
│   │   ├── query.py           # get_project_tree, get_call_graph, etc.
│   │   ├── tracer_tool.py     # start_tracer, stop_tracer
│   │   └── ui_tool.py         # open_ui helper
│   ├── tracers/
│   │   ├── dynamic_tracer.py
│   │   └── trace_script.py
│   └── server.py              # fastmcp MCP server entry point
│
├── web_ui/
│   ├── server.py              # FastAPI app serving frontend + API
│   ├── routes.py              # REST API routes (/api/analyze, /api/tree, etc.)
│   └── frontend/
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       └── src/
│           ├── main.tsx
│           ├── App.tsx            # Layout: sidebar + topbar + tab content
│           ├── index.css          # CSS vars, dark/light theme, dot-grid
│           ├── store/
│           │   └── useStore.ts    # Zustand: path, tab, theme, stats
│           └── components/
│               ├── DraggableTreeGraph.tsx  # SVG tree with drag/zoom/pan
│               ├── ProjectTree.tsx         # Tree view wrapper + legend
│               ├── CallGraph.tsx           # React Flow call graph
│               ├── DbSchema.tsx            # DB schema diagram
│               ├── RoutesView.tsx          # Routes table
│               ├── DevopsView.tsx          # DevOps topology
│               └── ExecutionDebugger.tsx   # Runtime trace viewer
│
├── project.md                 # This file
├── docs/
│   └── system-design.md       # ASCII wireframes and plans
├── pyproject.toml
├── setup.sh
└── mcp.json                   # MCP server config for AI clients
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend analysis | Python 3.11+, `ast` module, `aiosqlite` |
| MCP server | `fastmcp` library |
| Web server | FastAPI + Uvicorn |
| Frontend build | Vite + TypeScript |
| UI framework | React 18 |
| Styling | Tailwind CSS + CSS custom properties |
| State management | Zustand |
| Graph (call/db) | React Flow |
| Tree graph | Custom SVG (drag/zoom/pan) |
| Icons | Lucide React + custom branded SVGs |
| Package manager | `uv` (Python), npm (JS) |
| Database | SQLite (per-project, auto-created) |

---

## Running Locally

```bash
# From synapse_mcp root:
cd web_ui/frontend && npm run build && cd ../..
uv run python web_ui/server.py
# Open http://localhost:7432
```

---

## MCP Integration

Add to your AI client's MCP config (`mcp.json`):
```json
{
  "mcpServers": {
    "synapse": {
      "command": "uv",
      "args": ["run", "python", "-m", "mcp_server.server"],
      "cwd": "/path/to/synapse_mcp"
    }
  }
}
```

Available MCP tools: `analyze_project`, `get_project_tree`, `get_call_graph`, `get_db_schema`, `get_routes`, `get_devops`, `start_tracer`, `stop_tracer`, `open_ui`.
