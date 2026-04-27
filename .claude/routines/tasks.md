# Synapse MCP — Task List

Claude picks the first `[ ]` task each run, executes it, marks it `[x]`, then opens a PR.

---

## Frontend Tasks

- [ ] Add a search/filter input to the Call Graph view — user types a function name and the graph shows only that function and its connected nodes
- [ ] Add empty state component to all 6 views — when no project is analyzed yet, show a centered icon + message "Analyze a project to see the graph"
- [ ] Add loading skeleton to all 6 views — while data is fetching, show animated placeholder instead of blank screen
- [ ] Add a "Copy path" button on Project Tree nodes — click copies the full file path to clipboard
- [ ] Add method filter buttons to Routes view — GET / POST / PUT / DELETE / ALL toggle buttons that filter the routes table
- [ ] Add a minimap toggle button to Call Graph and DB Schema views — show/hide the React Flow minimap
- [ ] Add keyboard shortcut hints to the UI — show a small help panel (press ?) listing available shortcuts
- [ ] Add node count badge to each sidebar nav item — e.g. "Call Graph (187)" showing how many nodes that view has
- [ ] Improve the Debugger timeline — add color coding by call depth (deeper = darker), add elapsed time column
- [ ] Add export button to Call Graph view — exports the current graph as a PNG image

## Backend Tasks

- [ ] Improve FastAPI route detection to handle APIRouter with prefix — currently misses routes defined in sub-routers with prefix="/api/v1"
- [ ] Add detection for Django REST Framework ViewSets — detect router.register() and generate routes from it
- [ ] Add file size guard to the AST parser — skip files larger than 1MB to prevent memory issues
- [ ] Improve db_model field detection for SQLAlchemy — detect relationship() fields and add them to the model fields JSON
- [ ] Add a new MCP tool: get_function_detail(path, function_name) — returns full source code, args, return type, and all callers of a specific function
- [ ] Add path traversal protection to analyze_project — validate that the given path is a real directory and does not escape outside allowed locations
- [ ] Improve error messages in all MCP tools — instead of generic errors, return which file caused the problem and why
- [ ] Add detection for Celery tasks — detect @app.task and @celery.task decorators and add them as a special file role

## UI Polish Tasks

- [ ] Fix inconsistent padding across all 6 view panels — standardize to p-4 for all content areas
- [ ] Add smooth fade-in animation when switching between views — 150ms opacity transition
- [ ] Improve dark mode contrast for route method badges — GET/POST/PUT/DELETE badges should have higher contrast text
- [ ] Add hover tooltip to graph nodes showing full qualified name and file path
- [ ] Fix sidebar collapse animation — make it smooth slide instead of instant jump

## Test Tasks

- [ ] Create tests/fixtures/simple_fastapi/ — a minimal FastAPI app with 3 routes and 1 SQLAlchemy model used as test fixture
- [ ] Write tests/test_analyzers/test_ast_parser.py — test that functions, calls, and imports are detected correctly from a Python file
- [ ] Write tests/test_analyzers/test_fastapi_analyzer.py — test route detection and SQLAlchemy model detection using the simple_fastapi fixture
- [ ] Write tests/test_storage/test_database.py — test UPSERT functions and query functions using in-memory SQLite

## Documentation Tasks

- [ ] Update README.md MCP tools table to match all current tools in mcp_server/server.py
- [ ] Add docstrings to all @mcp.tool() functions that are missing them or have incomplete ones
- [ ] Create CHANGELOG.md with v0.1.0 entry listing all features built so far
