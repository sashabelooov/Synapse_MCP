## Run: 2026-04-27 02:10

### ASCII Wireframe

```
┌───────────────────────────────────────────────────────────────┐
│ SUBNAV  [Filter by function: _______________________ 🔍]     │
│         [Depth: 1 ─●──── 5]  [☐ Show external calls]        │
├───────────────────────────────────────────────────────────────┤
│  REACT FLOW CANVAS                  [⊕][⊖][⌂ Fit][⚙ Layout] │
│                                                               │
│   ┌───────────────────┐                                       │
│   │  create_user      │──────────────────────────────────╮   │
│   │  app/routers.py   │                                  │   │
│   └─────────┬─────────┘                                  ▼   │
│             │                             ┌─────────────────┐ │
│             ▼                             │  send_email     │ │
│   ┌─────────────────┐  ┌───────────────┐  │  utils/mail.py  │ │
│   │  validate_input │─▶│ hash_password │  └─────────────────┘ │
│   │  validators.py  │  │  security.py  │                    │
│   └─────────────────┘  └───────────────┘                    │
│                                                               │
│   Colors: [router]=indigo  [model]=emerald  [service]=sky    │
│   Edge label: call count if >1  (e.g. ×3)                   │
│                           ┌── MINIMAP ──────────────────┐    │
│                           │   · · ·· · ·· · · ···       │    │
│                           └─────────────────────────────┘    │
├───────────────────────────────────────────────────────────────┤
│ DETAIL PANEL (click a node to open)                          │
│  Function: create_user   File: app/routers.py   Line: 42    │
│  Args: username · password · db        is_async: ✓          │
│  Calls: 3 outbound   ←   Called by: 1 caller                │
└───────────────────────────────────────────────────────────────┘
```

### UI Elements

| Element | Type | Behavior |
|---|---|---|
| Filter by function input | Text input | Centers graph on matched function; dims others |
| Depth range slider | Slider input | Limits graph traversal to N hops from the root |
| Show external calls checkbox | Checkbox | Toggles visibility of unresolved callee nodes |
| ⊕ / ⊖ buttons | Icon buttons | Zoom the React Flow canvas in/out by 0.2 step |
| ⌂ Fit button | Icon button | Fits all visible nodes in viewport with padding |
| ⚙ Layout button | Icon button | Cycles: dagre TB → dagre LR → force-directed |
| Function node | React Flow node | Represents one function; fill color = file_role |
| Directed edge | React Flow edge | Arrow from caller to callee |
| Call-count label on edge | Badge on edge | Shows `×N` when callee is called N > 1 times |
| Minimap | Fixed corner overlay | Small thumbnail of full graph |
| Detail panel | Bottom collapsible panel | Shows metadata for the selected function node |

### Interactions

- Type in **Filter by function** → graph pans to center that node; unrelated nodes dim to 20%
- Drag **Depth slider** to 2 → only nodes within 2 hops of the filter root remain visible
- Check **Show external calls** → adds gray ghost nodes for unresolved callees (e.g. `requests.get`)
- Click **⚙ Layout** → cycles layout algorithm: dagre TB → dagre LR → force-directed
- Click a **function node** → opens detail panel with args, async flag, call counts, source location
- **Hover** a node → tooltip shows qualified name and source file path
- **Hover** an edge → tooltip shows caller line number and call count
- Click **⌂ Fit** → viewport zooms to fit all currently visible nodes
- **Drag** a node → repositions it; layout is not re-run (manual override mode)
- Double-click a **function node** → opens VS Code at the source line (if integration enabled)

### New Ideas This Run

**1. Subgraph Collapse to Group Node**
Clicking "Collapse subtree" on a function node merges all its callees into a single grouped node labeled "N functions".
Why it helps: Developers reviewing call graphs for large services can hide implementation details and focus on the top-level flow.

**2. Recursive Cycle Highlight**
Edges that form recursive loops are colored red with a dashed animation, and a warning badge appears on both nodes.
Why it helps: Learners and code reviewers can immediately spot infinite-recursion risks without reading source code manually.

**3. Call Frequency Heat Coloring**
Node background intensity scales from cool-blue (called rarely) to warm-orange (called frequently) based on inbound call count.
Why it helps: Project managers and architects can identify performance-critical functions at a glance when prioritizing optimization work.
