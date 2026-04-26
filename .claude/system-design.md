# Synapse MCP — System Design

## Table of Contents
1. [High-Level Architecture](#high-level-architecture)
2. [Data Model](#data-model)
3. [API Design](#api-design)
4. [Page Wireframes](#page-wireframes)
   - [App Shell](#app-shell)
   - [Project Tree](#1-project-tree-view)
   - [Call Graph](#2-call-graph-view)
   - [DB Schema](#3-db-schema-view)
   - [Routes](#4-routes-view)
   - [DevOps](#5-devops-view)
   - [Execution Debugger](#6-execution-debugger-view)
5. [Analysis Pipeline](#analysis-pipeline)
6. [Roadmap](#roadmap)

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENT  (browser: localhost:7432)                               │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │  Tree    │  │  Call    │  │  DB      │  │  Routes /    │    │
│  │  View    │  │  Graph   │  │  Schema  │  │  DevOps /    │    │
│  │  (SVG)   │  │  (Flow)  │  │  (Flow)  │  │  Debugger    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
│       │              │              │               │            │
│       └──────────────┴──────────────┴───────────────┘           │
│                              │ axios REST                        │
└──────────────────────────────┼───────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│  SERVER  FastAPI  (web_ui/server.py)                             │
│                                                                  │
│  POST /api/analyze     →  analyze_project()                      │
│  GET  /api/tree        →  get_project_tree()                     │
│  GET  /api/callgraph   →  get_call_graph()                       │
│  GET  /api/dbschema    →  get_db_schema()                        │
│  GET  /api/routes      →  get_routes()                           │
│  GET  /api/devops      →  get_devops()                           │
│  GET  /api/trace/*     →  tracer tools                           │
│                                                                  │
│  GET  /*               →  serves built React SPA                 │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│  ANALYSIS ENGINE  (mcp_server/)                                  │
│                                                                  │
│  Analyzers          Graph Builders       Storage                 │
│  ├── base.py        ├── builder.py       └── database.py         │
│  ├── ast_parser.py  │   call_graph()         aiosqlite           │
│  ├── fastapi_.py    │   db_graph()           per-project .sqlite │
│  ├── django_.py     └──                                          │
│  └── devops_.py                                                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │ reads/writes
┌──────────────────────────────▼───────────────────────────────────┐
│  SQLITE  <project>/.mcp_mental_model/db.sqlite                   │
│                                                                  │
│  projects · files · functions · calls ·                          │
│  db_models · routes · execution_traces                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Model

```
projects
  id · path · framework · analyzed_at

files
  id · project_id · relative_path · file_role
  file_role: router | model | service | test | config | util | unknown

functions
  id · file_id · name · qualified_name · line · args (JSON) · is_async

calls
  id · caller_id → functions.id
     · callee_id → functions.id (NULL if external)
     · callee_name · line

db_models
  id · project_id · name · fields (JSON) · source_file

routes
  id · project_id · method · path · handler_id → functions.id · tags (JSON)

execution_traces
  id · project_id · label · trace_data (JSON) · created_at
  label='__devops__' reserved for devops topology data
```

---

## API Design

```
POST /api/analyze
  Body:  { "path": "/abs/path/to/project" }
  200:   { "ok": true, "framework": "fastapi",
           "stats": { "files": N, "functions": N, "routes": N,
                      "db_models": N, "devops_files": N } }
  200:   { "ok": false, "error": "..." }

GET  /api/tree?path=...
  200:   { "ok": true, "tree": { name, type, path, children[] } }

GET  /api/callgraph?path=...&function_name=optional
  200:   { "ok": true, "nodes": [...], "edges": [...] }

GET  /api/dbschema?path=...
  200:   { "ok": true, "models": [...], "nodes": [...], "edges": [...] }

GET  /api/routes?path=...
  200:   { "ok": true, "routes": [{ method, path, handler_name, tags }] }

GET  /api/devops?path=...
  200:   { "ok": true, "files": [...], "nodes": [...], "edges": [...] }
```

---

## Page Wireframes

### App Shell

```
┌─────────────────────────────────────────────────────────────────┐
│◀ ║  TOPBAR (48px)                                               │
│  ║  [⚡ Synapse Alpha]  [/path/input________________] [▶Analyze]│
│  ║                                           [error?]    [☀/🌙]│
├──╬─────────────────────────────────────────────────────────────┤
│  ║                                                              │
│S ║                                                              │
│I ║              MAIN CONTENT AREA                               │
│D ║                                                              │
│E ║              (tab component fills this space)                │
│B ║                                                              │
│A ║                                                              │
│R ║                                                              │
│  ║                                                              │
│  ║                                                              │
├──╬─────────────────────────────────────────────────────────────┤
│  ║  SIDEBAR (208px, collapsible)                                │
│  ╠══════════════════╗                                           │
│  ║ ⚡ Synapse Alpha  ║  half-circle handle on right edge        │
│  ╠══════════════════╣  slides with sidebar                      │
│  ║ 🌲 Project Tree   ║                                          │
│  ║ ⑂  Call Graph    ║  ◀── nav items (disabled until analyzed) │
│  ║ 🗄  DB Schema     ║                                          │
│  ║ 🛣  Routes        ║                                          │
│  ║ 📦 DevOps         ║                                          │
│  ║ 🐛 Debugger       ║                                          │
│  ╠══════════════════╣                                           │
│  ║ [stats card]      ║  shown after analyze                     │
│  ║ FastAPI           ║                                          │
│  ║ Files       42    ║                                          │
│  ║ Functions   187   ║                                          │
│  ║ Routes      23    ║                                          │
│  ║ DB Models   8     ║                                          │
│  ╚══════════════════╝                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

### 1. Project Tree View

```
┌─────────────────────────────────────────────────────────────────┐
│  SUBNAV: [⬇ Top-Bottom] [→ Left-Right]          [Legend pills] │
│          [router][model][service][test][config][util]           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                     DOT-GRID CANVAS                             │
│                                                                 │
│              ┌──────────────────┐                               │
│              │ 📁 my-project    │   ← root folder node          │
│              └────────┬─────────┘                               │
│               ╭───────┴───────╮                                 │
│     ┌─────────┴──┐       ┌────┴──────────┐                      │
│     │ 📁 app     │       │ 🐳 Dockerfile │                      │
│     └─────┬──────┘       └──────────────┘                      │
│     ╭─────┴──────╮                                              │
│  ┌──┴───┐   ┌────┴──────┐                                       │
│  │🐍main│   │🐍 routes  │  ← file nodes with icon + role pill   │
│  │.py   │   │.py [router│                                       │
│  └──────┘   └───────────┘                                       │
│                                                                 │
│  Drag nodes: hold mouse on node, move                           │
│  Pan canvas: hold mouse on empty area, drag                     │
│  Zoom:       scroll wheel                                       │
│                                                                 │
│  ┌─────────────────────────────────────┐                        │
│  │ NODE CARD (104×42px)                │                        │
│  │ [icon 20px] filename.py  [role pill]│                        │
│  └─────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

**Arrows:** cubic bezier, marker-end arrowhead, color `#8083ff` (dark) / `#6366f1` (light).

---

### 2. Call Graph View

```
┌─────────────────────────────────────────────────────────────────┐
│  SUBNAV: [Filter by function: ________________ 🔍]              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐                                              │
│   │ create_user  │ ─────────────────────────────────────────╮  │
│   └──────────────┘                                          │  │
│          │                                                  ▼  │
│          ▼                                       ┌───────────────┐│
│   ┌──────────────┐       ┌──────────────┐        │ send_email    ││
│   │ validate_    │──────▶│ hash_password│        └───────────────┘│
│   │ input        │       └──────────────┘                       │
│   └──────────────┘                                              │
│                                                                 │
│   React Flow:  zoom · pan · minimap · controls                  │
│   Node colors: by file_role                                     │
│   Edge label:  call count (if > 1)                              │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3. DB Schema View

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌─────────────────────┐     ┌─────────────────────────┐       │
│  │ User                │     │ Post                    │       │
│  │─────────────────────│     │─────────────────────────│       │
│  │ id         integer  │     │ id         integer       │       │
│  │ username   varchar  │◀────│ author_id  FK→User       │       │
│  │ email      varchar  │     │ title      varchar       │       │
│  │ created_at datetime │     │ body       text          │       │
│  └─────────────────────┘     │ created_at datetime      │       │
│                              └─────────────────────────┘       │
│          ┌───────────────────────────────────┐                  │
│          │ Comment                           │                  │
│          │───────────────────────────────────│                  │
│          │ id       integer                  │                  │
│          │ post_id  FK→Post                  │──────────────╯   │
│          │ user_id  FK→User                  │                  │
│          │ body     text                     │                  │
│          └───────────────────────────────────┘                  │
│                                                                 │
│   React Flow:  zoom · pan · minimap                             │
│   Edge style:  dashed for FK, solid for M2M                     │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4. Routes View

```
┌─────────────────────────────────────────────────────────────────┐
│  SUBNAV: [Search: ________________] [Filter: GET POST PUT DEL]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  METHOD  PATH                    HANDLER           TAGS         │
│  ──────  ──────────────────────  ────────────────  ──────────   │
│  GET     /users                  list_users        [users]      │
│  POST    /users                  create_user       [users]      │
│  GET     /users/{id}             get_user          [users]      │
│  PUT     /users/{id}             update_user       [users]      │
│  DELETE  /users/{id}             delete_user       [users]      │
│  GET     /posts                  list_posts        [posts]      │
│  POST    /posts                  create_post       [posts]      │
│  GET     /health                 health_check      [system]     │
│                                                                 │
│  METHOD badges:  GET=blue  POST=green  PUT=orange  DEL=red      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5. DevOps View

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐    ┌──────────────┐     │
│  │ 🐳 Dockerfile│────▶│ 🐙 compose   │    │ ⚙ .github/   │     │
│  │              │     │ web service  │    │ workflows/   │     │
│  └──────────────┘     └──────┬───────┘    │ ci.yml       │     │
│                              │            └──────────────┘     │
│                    ┌─────────▼───────┐                         │
│                    │ 🐙 compose      │                          │
│                    │ postgres service│                          │
│                    └─────────────────┘                          │
│                                                                 │
│  ┌──────────────┐                                              │
│  │ 📄 .env      │   environment config                         │
│  └──────────────┘                                              │
│                                                                 │
│  FILE LIST (right panel):                                       │
│  ─────────────────────────────────────────────────────────────  │
│  Dockerfile          docker image definition                    │
│  docker-compose.yml  service orchestration                      │
│  .github/ci.yml      CI pipeline                               │
│  .env.example        environment template                       │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6. Execution Debugger View

```
┌─────────────────────────────────────────────────────────────────┐
│  SUBNAV: [Entry point: ________________] [▶ Run Trace] [■ Stop] │
├───────────────────────────────────┬─────────────────────────────┤
│  CALL TIMELINE                    │  FUNCTION DETAIL            │
│                                   │                             │
│  0ms  →  main()                   │  Name:  validate_input      │
│  2ms    →  load_config()          │  File:  app/validators.py   │
│  5ms    →  create_app()           │  Line:  42                  │
│  8ms      →  setup_routes()       │  Args:                      │
│  12ms     →  connect_db()         │    data = {"name": "Alice"} │
│  15ms   →  validate_input()  ◀── selected                       │
│  18ms     →  hash_password()      │  Return: True               │
│  22ms   →  insert_user()          │  Duration: 3ms              │
│  25ms  ←  main()                  │                             │
│                                   │                             │
│  Indent = call depth              │                             │
│  ← = return                       │                             │
│  Click row to see args/return     │                             │
└───────────────────────────────────┴─────────────────────────────┘
```

---

## Analysis Pipeline

```
analyze_project(path)
       │
       ├─1─ detect_framework(path)
       │         manage.py? → "django"
       │         FastAPI import? → "fastapi"
       │         else → "unknown"
       │
       ├─2─ collect_python_files(path)
       │         rglob("*.py")
       │         skip: SKIP_DIRS set
       │
       ├─3─ for each .py file:
       │         parse_file(path) → FileInfo
       │           ast.parse() → walk nodes
       │           FunctionDef → function record
       │           Call nodes → call records
       │           Import → detect file_role
       │
       ├─4─ framework analyzer:
       │       FastAPI:
       │         @app.get/post/put/delete/patch → route record
       │         APIRouter → grouped routes
       │       Django:
       │         urlpatterns = [...] → route records
       │         class Model(models.Model) → db_model record
       │           field definitions → fields JSON
       │           ForeignKey/ManyToMany → relations
       │       DevOps:
       │         Dockerfile → node
       │         docker-compose.yml → parse services → nodes + edges
       │         .github/workflows/*.yml → nodes
       │         k8s/*.yaml → nodes
       │         .env* → nodes
       │         → store as execution_trace label='__devops__'
       │
       └─5─ persist to SQLite
                 UPSERT project
                 UPSERT files + roles
                 UPSERT functions
                 UPSERT calls
                 UPSERT db_models
                 UPSERT routes
```

---

## TypeScript MCP Migration Plan

### Why switch to TypeScript MCP?

Most popular MCP servers (Anthropic official, GitHub, Postgres, Brave Search) use TypeScript + `@modelcontextprotocol/sdk`.
Users install with a single `npx` command — no Python setup, no venv, no uv.

Python analysis engine stays — it's the only thing that can parse Python AST accurately.
TypeScript wraps it as a thin shell layer.

### New Architecture (after migration)

```
┌─────────────────────────────────────────────────────────────────┐
│  AI CLIENT  (Claude Desktop / Cursor / VS Code)                 │
│                                                                  │
│  mcp.json:                                                       │
│  {                                                               │
│    "synapse": {                                                  │
│      "command": "npx",                                           │
│      "args": ["-y", "synapse-mcp", "/path/to/project"]          │
│    }                                                             │
│  }                                                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ stdio (MCP protocol)
┌──────────────────────────▼──────────────────────────────────────┐
│  TypeScript MCP Server  (npm package: synapse-mcp)              │
│  src/index.ts                                                    │
│                                                                  │
│  tools:                                                          │
│  ├── analyze_project(path)                                       │
│  ├── get_project_tree(path)                                      │
│  ├── get_call_graph(path, function?)                             │
│  ├── get_db_schema(path)                                         │
│  ├── get_routes(path)                                            │
│  └── get_devops(path)                                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Python Bridge  (child_process.spawn)                     │    │
│  │                                                          │    │
│  │  spawn("python", ["-m", "synapse_mcp.cli", ...args])     │    │
│  │  read stdout JSON → return to MCP client                 │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ subprocess stdin/stdout JSON
┌──────────────────────────▼──────────────────────────────────────┐
│  Python Analysis CLI  (synapse_mcp/cli.py)                      │
│                                                                  │
│  python -m synapse_mcp.cli analyze /path  → JSON stdout         │
│  python -m synapse_mcp.cli tree /path     → JSON stdout         │
│  python -m synapse_mcp.cli callgraph /path → JSON stdout        │
│                                                                  │
│  (same analyzers, same SQLite storage — unchanged)               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ reads/writes
┌──────────────────────────▼──────────────────────────────────────┐
│  SQLite  <project>/.mcp_mental_model/db.sqlite                  │
└─────────────────────────────────────────────────────────────────┘
```

### Migration Steps

```
Step 1 — Add Python CLI entry point
  synapse_mcp/cli.py
  Commands: analyze | tree | callgraph | dbschema | routes | devops
  Output: JSON to stdout
  Test: python -m synapse_mcp.cli analyze /path/to/project

Step 2 — Create TypeScript MCP package
  synapse-mcp-ts/
  ├── package.json       (name: "synapse-mcp", bin: "synapse-mcp")
  ├── tsconfig.json
  └── src/
      └── index.ts       (@modelcontextprotocol/sdk server)

Step 3 — Python bridge in TypeScript
  spawnSync("python", ["-m", "synapse_mcp.cli", cmd, ...args])
  Parse stdout as JSON, return to MCP client

Step 4 — Publish to npm
  npm publish
  → users: npx synapse-mcp /path/to/project

Step 5 — Keep Web UI as optional
  npx synapse-mcp --ui  → opens browser at localhost:7432
  (same React frontend, served by TypeScript http server)
```

### File Structure After Migration

```
synapse_mcp/                    ← Python analysis engine (unchanged)
  mcp_server/
  web_ui/
  synapse_mcp/cli.py            ← NEW: CLI bridge

synapse-mcp-ts/                 ← NEW: TypeScript MCP package
  package.json
  src/
    index.ts                    ← MCP server entry
    bridge.ts                   ← Python subprocess caller
    tools/
      analyze.ts
      tree.ts
      callgraph.ts
      schema.ts
      routes.ts
      devops.ts
```

---

## Roadmap

### v0.1 (current)
- [x] Static analysis: FastAPI + Django
- [x] Project tree with drag/zoom/pan
- [x] Call graph (React Flow)
- [x] DB schema diagram
- [x] Routes table
- [x] DevOps topology
- [x] Execution debugger (dynamic tracer)
- [x] Dark / Light theme
- [x] MCP server protocol

### v0.2 (planned)
- [ ] Search / filter in Project Tree (highlight matching nodes)
- [ ] Click node → jump to source file (VS Code integration)
- [ ] Call graph: collapse/expand subgraphs
- [ ] Routes: click route → show handler code preview
- [ ] Export: PNG / SVG snapshot of any view
- [ ] Multi-project workspace (analyze multiple paths)

### v0.3 (future)
- [ ] TypeScript / Node.js project support
- [ ] Go project support
- [ ] AI chat panel: ask questions about the analyzed codebase
- [ ] Diff mode: compare two analysis snapshots
- [ ] GitHub Action: auto-analyze on push, post summary comment
- [ ] Team sharing: export/import `.mcp_mental_model/` bundles
