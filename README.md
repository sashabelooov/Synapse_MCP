# Synapse MCP

> Build a mental model of any Python backend — instantly.

Synapse MCP analyzes FastAPI and Django projects and gives AI assistants (and human developers) a structured, visual understanding of the codebase: project tree, function call graph, database schema, API routes, DevOps topology, and live execution tracing.

---

## What it does

When a backend grows large, it becomes hard to keep track of how everything connects. Synapse MCP solves this by:

- **Parsing your code** with Python AST — no server needed, works offline
- **Building a mental model** — functions, calls, routes, DB models, infra files
- **Exposing that model to AI** via MCP tools (Claude Desktop, Cursor, VS Code)
- **Showing it visually** in a React graph UI at `localhost:7432`

---

## Views

| View | What you see |
|------|-------------|
| **Project Tree** | Interactive file/folder graph with role labels (router, model, service, etc.) |
| **Call Graph** | Which functions call which — zoom, pan, filter by name |
| **DB Schema** | ORM models as an ER diagram with FK relationships |
| **Routes** | All API endpoints with method badges, handler names, and tags |
| **DevOps** | Dockerfile, Compose services, CI/CD, K8s, Nginx — as a topology graph |
| **Execution Debugger** | Live call timeline: run any function, see the exact call order and timing |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  AI Client  (Claude Desktop / Cursor / VS Code)      │
│  + Browser  (localhost:7432)                         │
└──────────────────────┬──────────────────────────────┘
                       │ MCP protocol (stdio)
┌──────────────────────▼──────────────────────────────┐
│  MCP Server  (fastmcp)                               │
│  analyze_project · get_project_tree                  │
│  get_call_graph  · get_db_schema                     │
│  get_routes      · get_devops                        │
│  trace_execution · open_ui                           │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  Analysis Engine                                     │
│  ├── Static: Python AST + libcst                     │
│  │   FastAPI analyzer · Django analyzer              │
│  │   DevOps analyzer  · AST parser                   │
│  └── Dynamic: instrumented subprocess tracer         │
└──────────────────────┬──────────────────────────────┘
                       │ reads/writes
┌──────────────────────▼──────────────────────────────┐
│  SQLite  <project>/.mcp_mental_model/db.sqlite       │
│  projects · files · functions · calls                │
│  db_models · routes · execution_traces               │
└─────────────────────────────────────────────────────┘
```

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `analyze_project(path)` | Full static analysis — must be called first |
| `get_project_tree(path)` | Directory/file tree as nested JSON |
| `get_call_graph(path, function_name?)` | Function call graph; filter by function for subgraph |
| `get_db_schema(path)` | ORM models with fields and FK relationships |
| `get_routes(path)` | All API routes with method, path, handler, tags |
| `get_devops(path)` | DevOps/infra topology (Docker, CI/CD, K8s, Nginx) |
| `trace_execution(path, module_file, function_name, args?)` | Dynamic runtime trace |
| `get_traces(path)` | List saved execution traces |
| `get_trace_detail(path, trace_id)` | Full call timeline for a trace |
| `open_ui(project_path?)` | Launch visual UI at `http://127.0.0.1:7432` |

---

## Supported Frameworks & Infra

**Backends**
- FastAPI — routes (`@app.get/post/put/delete`), APIRouter, SQLAlchemy models
- Django — `urlpatterns`, `views.py`, Django ORM models + ForeignKey/M2M

**Databases** (detected via ORM)
- SQLAlchemy (PostgreSQL, SQLite, MySQL)
- Django ORM (any backend)

**DevOps files**
- Docker, Docker Compose, Nginx
- GitHub Actions, GitLab CI, CircleCI
- Kubernetes manifests, Terraform, Ansible
- Makefile, `.env` files

---

## Installation

**Requirements:** Python 3.11+, [uv](https://github.com/astral-sh/uv)

```bash
git clone https://github.com/your-username/synapse_mcp
cd synapse_mcp
uv sync
```

---

## Running

### Visual UI only

```bash
uv run python -m web_ui.server
# Opens http://127.0.0.1:7432
```

Enter your project path in the top bar, click **Analyze**, then explore the tabs.

### MCP Server (for Claude Desktop / Cursor)

Add to your `mcp.json`:

```json
{
  "mcpServers": {
    "synapse-mcp": {
      "command": "uv",
      "args": ["run", "python", "-m", "mcp_server.server"],
      "cwd": "/path/to/synapse_mcp"
    }
  }
}
```

Then in Claude: `analyze_project("/path/to/your/fastapi-project")`

---

## Quickstart Example

```
You: analyze_project("/home/user/my-fastapi-app")

Claude: Analyzed. Found:
  • Framework: FastAPI
  • Files: 42  Functions: 187  Routes: 23  DB Models: 8

You: get_routes("/home/user/my-fastapi-app")

Claude: POST /auth/login → login_user  [auth]
        GET  /users      → list_users  [users]
        ...

You: trace_execution("/home/user/my-fastapi-app", "app/service.py", "create_user", ["Alice"])

Claude: Call trace (18 steps):
  0ms  create_user()
  1ms    validate_input()
  4ms    hash_password()
  7ms    db.add()
  ...
```

---

## Project Structure

```
synapse_mcp/
├── mcp_server/
│   ├── server.py              # MCP entry point (fastmcp)
│   ├── config.py
│   ├── analyzers/
│   │   ├── ast_parser.py      # Core Python AST analysis
│   │   ├── fastapi_analyzer.py
│   │   ├── django_analyzer.py
│   │   └── devops_analyzer.py
│   ├── tools/
│   │   ├── analyze.py         # analyze_project tool
│   │   ├── query.py           # tree/graph/schema/routes/devops tools
│   │   └── tracer_tool.py     # runtime trace tools
│   ├── tracer/
│   │   ├── dynamic_tracer.py  # subprocess instrumentation
│   │   └── trace_script.py    # injected trace runner
│   └── storage/
│       └── database.py        # aiosqlite persistence
└── web_ui/
    ├── server.py              # FastAPI server + static files
    ├── api/
    │   └── routes.py          # REST endpoints for the UI
    └── frontend/              # React + React Flow + shadcn/ui
        ├── src/
        └── vite.config.ts
```

---

## Roadmap

### v0.1 (current)
- Static analysis: FastAPI + Django
- Project tree, call graph, DB schema, routes, DevOps views
- Dynamic execution tracer
- Dark / light theme
- MCP server protocol

### v0.2 (planned)
- Search/filter in Project Tree
- Click node → jump to source in VS Code
- Call graph subgraph collapse/expand
- Route → handler code preview
- PNG/SVG export of any view
- Multi-project workspace

### v0.3 (future)
- TypeScript / Node.js project support
- Go project support
- AI chat panel: ask questions about the codebase
- Diff mode: compare two analysis snapshots
- GitHub Action: auto-analyze on push
- Team sharing: export/import `.mcp_mental_model/` bundles

---

## License

MIT
