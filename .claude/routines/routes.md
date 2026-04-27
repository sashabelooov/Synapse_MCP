## Run: 2026-04-27 02:10

### ASCII Wireframe

```
┌───────────────────────────────────────────────────────────────┐
│ SUBNAV  [🔍 Search: ___________________________]  [↓ Export] │
│         [ALL] [GET] [POST] [PUT] [PATCH] [DELETE]            │
├──────────┬───────────────────────────┬──────────────┬─────────┤
│ METHOD   │ PATH                      │ HANDLER      │ TAGS    │
├──────────┼───────────────────────────┼──────────────┼─────────┤
│ [GET]    │ /users                    │ list_users   │ [users] │
│ [POST]   │ /users                    │ create_user  │ [users] │
│ [GET]    │ /users/{id}               │ get_user     │ [users] │
│ [PUT]    │ /users/{id}               │ update_user  │ [users] │
│ [DELETE] │ /users/{id}               │ delete_user  │ [users] │
│ [GET]    │ /posts                    │ list_posts   │ [posts] │
│ [POST]   │ /posts                    │ create_post  │ [posts] │
│ [GET]    │ /health                   │ health_check │[system] │
├──────────┴───────────────────────────┴──────────────┴─────────┤
│ ▼ EXPANDED ROW (click any row to toggle)                     │
│  Handler: create_user   File: app/routers.py   Line: 24     │
│  ┌── Source Preview ─────────────────────────────────────┐   │
│  │ @app.post("/users")                                   │   │
│  │ async def create_user(data: UserCreate, db: Session): │   │
│  │     ...                                               │   │
│  └───────────────────────────────────────────────────────┘   │
│  8 routes total  ·  5 GET  ·  2 POST  ·  1 DELETE           │
└───────────────────────────────────────────────────────────────┘
```

### UI Elements

| Element | Type | Behavior |
|---|---|---|
| Search input | Text input | Filters rows in real-time by path, handler, or tag |
| Method filter buttons | Segmented control | Shows only routes matching that HTTP verb |
| ↓ Export button | Icon button | Downloads route list as CSV or JSON |
| Table header row | Sortable header | Sorts column ascending/descending on click |
| Method badge | Colored chip | GET=blue, POST=green, PUT=orange, PATCH=yellow, DELETE=red |
| Path cell | Text cell | Shows parameterized route path; truncates if long |
| Handler cell | Clickable text | Clicking expands the row accordion below it |
| Tags cell | Badge chips | One chip per FastAPI tag; click chip to filter by tag |
| Expanded row | Accordion panel | Shows source preview, file path, line number |
| Source preview | Code block | Syntax-highlighted handler function signature |
| Route count strip | Status bar | Shows totals per HTTP method at the bottom |

### Interactions

- Type in **Search input** → filters table rows in real-time by path substring, handler name, or tag
- Click a **method filter** (e.g. `[GET]`) → shows only GET routes; active button is highlighted; click again to clear
- Click a **table column header** → sorts rows alphabetically by that column; click again to reverse sort
- Click any **table row** → expands an accordion below showing handler source preview and file metadata
- Click **handler name** in expanded row → opens VS Code at that exact line (if integration active)
- Click a **tag chip** → filters table to show only routes sharing that tag
- Click **↓ Export** → downloads `synapse-routes-YYYY-MM-DD.csv` with all visible rows
- **Hover** a method badge → tooltip shows the HTTP verb and its REST semantic
- **Hover** a path cell → tooltip shows full path if the cell is truncated

### New Ideas This Run

**1. OpenAPI Spec Preview Panel**
A "View OpenAPI" button renders a minimal Swagger-style card for the selected route, showing request body schema and expected response codes.
Why it helps: Frontend developers and API consumers can verify the contract for a route without running the server or reading FastAPI docs.

**2. Route Group Collapsing by Tag**
Routes with the same tag are grouped under a collapsible section header (e.g. `[users] — 5 routes`), collapsible with one click.
Why it helps: Project managers reviewing large APIs can collapse unrelated groups and focus on the domain they are currently auditing.

**3. Latency Annotation from Trace Data**
When execution traces exist, a small `~12ms avg` annotation appears beside each route's handler name, pulled from stored trace records.
Why it helps: Performance-focused developers can identify slow endpoints directly in the routes table without running a separate profiler tool.
