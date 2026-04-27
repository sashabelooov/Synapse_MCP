## Run: 2026-04-27 02:10

### ASCII Wireframe

```
┌───────────────────────────────────────────────────────────────┐
│ SUBNAV  [↕ Top-Bot] [→ Left-Right]   [🔍 Search: _________] │
│         [router][model][service][test][config][util][unknown] │
├───────────────────────────────────────────────────────────────┤
│  DOT-GRID CANVAS                      [⊕][⊖][⌂ Fit][📷 PNG] │
│                                                               │
│           ┌──────────────────────┐                            │
│           │ 📁 my-project        │   ← root folder node       │
│           └──────────┬───────────┘                            │
│              ╭───────┴──────────╮                             │
│    ┌──────────┴─┐      ┌────────┴──────┐                      │
│    │ 📁 app     │      │ 🐳 Dockerfile │                      │
│    └─────┬──────┘      └───────────────┘                      │
│      ╭───┴──────────────────╮                                 │
│  ┌───┴────┐  ┌──────────────┴┐  ┌──────────────┐             │
│  │🐍 main │  │🐍 routes.py   │  │🐍 models.py  │             │
│  │ .py    │  │   [router]    │  │   [model]    │             │
│  └────────┘  └───────────────┘  └──────────────┘             │
│                                                               │
│  ── NODE CARD (104 × 42 px) ───────────────────────────────  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 🐍  routes.py                              [router]     │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                 ┌─── MINIMAP ──────────────┐  │
│                                 │  ·· · ·· · · ·· ·        │  │
│                                 └──────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### UI Elements

| Element | Type | Behavior |
|---|---|---|
| ↕ Top-Bottom button | Toggle button | Switches dagre layout to top-to-bottom direction |
| → Left-Right button | Toggle button | Switches dagre layout to left-to-right direction |
| Search input | Text input | Highlights matching nodes; dims non-matches to 20% opacity |
| Role filter pills | Multi-toggle chips | Shows/hides nodes by file_role category |
| ⊕ Zoom-in button | Icon button | Increments canvas zoom by 0.2 step |
| ⊖ Zoom-out button | Icon button | Decrements canvas zoom by 0.2 step |
| ⌂ Fit button | Icon button | Animates viewport to show all nodes with 40 px padding |
| 📷 PNG button | Icon button | Downloads canvas snapshot as PNG file |
| Folder node | Draggable React Flow node | Represents a directory; shows child count |
| File node card | Draggable React Flow node | Shows icon, filename, and role pill |
| Role pill | Badge chip | Color-coded label indicating file_role |
| Bezier edge | SVG path connector | Connects parent folder to child node |
| Minimap | Fixed corner overlay | Thumbnail view of full graph; click to jump to region |
| Canvas (dot-grid) | Pan/zoom surface | Drag empty area to pan; scroll to zoom |

### Interactions

- Click **↕ Top-Bottom** → re-runs dagre layout vertically; nodes animate to new positions
- Click **→ Left-Right** → re-runs dagre layout horizontally; nodes animate to new positions
- Type in **Search input** → matching node names glow with indigo border; others dim to 20%
- Click a **role filter pill** (e.g. `[router]`) → hides nodes of all other roles; re-click to restore
- Click **⌂ Fit** → viewport smoothly pans/zooms to fit all nodes with 40 px padding
- Click **📷 PNG** → downloads `synapse-tree-YYYY-MM-DD.png` of the current viewport
- **Drag a node** → repositions node freely; connected bezier edges follow
- **Scroll** on canvas → zooms in/out (range: 0.1× – 4×)
- **Drag** on empty canvas area → pans the viewport
- **Hover** a file node → tooltip shows full relative path and function count
- Click a **file node** → opens right-side detail panel listing all functions in that file
- Click **minimap** area → jumps viewport center to the clicked region

### New Ideas This Run

**1. Inline Function Count Badge**
Each file node shows a small badge (e.g. `ƒ 12`) in its top-right corner with the number of functions defined inside.
Why it helps: Developers instantly identify large, complex files without opening them, guiding refactor decisions.

**2. Collapse/Expand Folder Subtrees**
Double-clicking a folder node collapses all its children into a single placeholder "…N files" node.
Why it helps: Project managers exploring monorepos can hide irrelevant modules to focus on the area they care about.

**3. Cmd+K File Jump Palette**
Pressing Cmd+K opens a fuzzy-search command palette over the canvas; selecting a result centers and highlights that node.
Why it helps: New contributors can navigate to any file instantly without manually scanning the full tree structure.
