## Run: 2026-04-27 02:10

### ASCII Wireframe

```
┌───────────────────────────────────────────────────────────────┐
│ SUBNAV  [🔍 Search model: __________________]  [⊕][⊖][⌂ Fit]│
│         [☐ Show field types]  [☐ Highlight FK chains]        │
├───────────────────────────────────────────────────────────────┤
│  REACT FLOW CANVAS  (ER DIAGRAM)                              │
│                                                               │
│  ┌──────────────────────┐   ┌──────────────────────────┐     │
│  │ User                 │   │ Post                     │     │
│  │──────────────────────│   │──────────────────────────│     │
│  │ id        integer    │   │ id           integer     │     │
│  │ username  varchar    │◀──│ author_id    FK → User   │     │
│  │ email     varchar    │   │ title        varchar     │     │
│  │ created_at datetime  │   │ body         text        │     │
│  └──────────────────────┘   │ created_at   datetime   │     │
│                             └──────────────────────────┘     │
│       ┌───────────────────────────────────┐                   │
│       │ Comment                           │                   │
│       │───────────────────────────────────│                   │
│       │ id       integer                  │                   │
│       │ post_id  FK → Post                │──────────────╮   │
│       │ user_id  FK → User                │              │   │
│       │ body     text                     │              ▼   │
│       └───────────────────────────────────┘                   │
│  FK edge: ─ ─ ─▶   M2M edge: ══▶    ┌── MINIMAP ──────────┐ │
│                                      │  ·· · ·· ·· · ·    │ │
│                                      └────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### UI Elements

| Element | Type | Behavior |
|---|---|---|
| Search model input | Text input | Filters and highlights matching model nodes |
| ⊕ / ⊖ buttons | Icon buttons | Zoom in/out on the ER canvas |
| ⌂ Fit button | Icon button | Fits all model nodes in viewport with padding |
| Show field types checkbox | Checkbox | Toggles full type annotations on field rows |
| Highlight FK chains checkbox | Checkbox | Traces full FK dependency chain in amber on click |
| Model node header | React Flow node header | Bold model name on colored background |
| Model node field rows | Text rows inside node | Each row: field name + type annotation |
| FK field row | Highlighted row | Shows `FK → ModelName`; edge connects models |
| Dashed FK edge | React Flow edge | Connects FK field to the referenced model |
| Solid M2M edge | React Flow edge | Connects many-to-many relationship between models |
| Minimap | Fixed corner overlay | Thumbnail of full ER diagram; click to jump |

### Interactions

- Type in **Search model** → matching model nodes glow with amber border; non-matches dim
- Check **Show field types** → field rows expand to full type strings (e.g. `CharField(max_length=255)`)
- Check **Highlight FK chains** → clicking any FK edge traces the full chain to root model in amber
- Click a **model node header** → opens right-side panel with full model source code preview
- Click a **FK edge** → highlights both connected nodes in indigo; tooltip shows relationship label
- Click a **field row** → tooltip shows the full Django/SQLAlchemy field definition string
- **Hover** a model node → tooltip shows source file path and total field count
- **Drag** a model node → repositions it freely; all connected edges follow
- **Scroll** on canvas → zooms in/out (0.1× – 4×)
- Click **⌂ Fit** → viewport zooms to fit all model nodes with 40 px padding

### New Ideas This Run

**1. Field Diff Overlay**
When two analysis snapshots exist, toggling "Diff mode" colors new fields green, removed fields red, and changed fields yellow on each model node.
Why it helps: Developers reviewing schema migrations can instantly see what changed without reading raw migration files.

**2. SQL DDL Export**
A "Copy DDL" button in the subnav generates a `CREATE TABLE` SQL script from the analyzed models and copies it to the clipboard.
Why it helps: Learners studying a Django project can extract a ready-to-run SQL schema for experimentation without setting up the full app.

**3. Circular FK Warning Badge**
Models involved in circular foreign key references automatically show a red ⚠ badge with a tooltip explaining the cycle path.
Why it helps: Project managers and architects are alerted to potential data integrity risks before they cause migration failures.
