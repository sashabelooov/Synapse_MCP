## Run: 2026-04-27 02:10

### ASCII Wireframe

```
┌───────────────────────────────────────────────────────────────┐
│ SUBNAV  [Entry: ____________________] [▶ Run Trace] [■ Stop] │
│         [⏮ Step Back] [⏭ Step Fwd]  [Speed: ●──── Fast]    │
├──────────────────────────────────┬────────────────────────────┤
│  CALL TIMELINE                   │  FUNCTION DETAIL           │
│                                  │                            │
│  0ms  →  main()                  │  Name:  validate_input     │
│  2ms    →  load_config()         │  File:  app/validators.py  │
│  5ms    →  create_app()          │  Line:  42                 │
│  8ms      →  setup_routes()      │  ───────────────────────── │
│  12ms     →  connect_db()        │  Args:                     │
│  15ms   →  validate_input() ◀── │    data = {                │
│  18ms     →  hash_password()     │      "name": "Alice",      │
│  22ms   →  insert_user()         │      "email": "a@b.com"    │
│  25ms  ←  main()                 │    }                       │
│                                  │  ───────────────────────── │
│  [← return]  [→ call]            │  Return: True              │
│  Indent = call depth             │  Duration: 3ms             │
│                                  │  Calls made: 2             │
│                                  │  [🔍 Jump to source]       │
│  ┌── FLAME CHART ─────────────┐  │                            │
│  │▓▓▓▓▓▓▓▓▓ main ▓▓▓▓▓▓▓▓▓▓▓│  │                            │
│  │  ▓▓▓▓▓ create_app ▓▓▓▓▓▓  │  │                            │
│  │    ▓▓▓ validate_input ▓▓  │  │                            │
│  └────────────────────────────┘  │                            │
└──────────────────────────────────┴────────────────────────────┘
```

### UI Elements

| Element | Type | Behavior |
|---|---|---|
| Entry point input | Text input | Accepts a function or module name as trace start |
| ▶ Run Trace button | Primary button | Starts dynamic trace and populates the timeline |
| ■ Stop button | Secondary button | Halts an in-progress trace; shows partial results |
| ⏮ Step Back button | Icon button | Moves selection to previous timeline event |
| ⏭ Step Forward button | Icon button | Moves selection to next timeline event |
| Speed slider | Range slider | Controls trace replay speed from slow to fast |
| Call timeline panel | Scrollable list | Indented rows showing function call sequence |
| Timeline row | Selectable list item | Shows timestamp, indent depth arrow, function name |
| Return indicator `←` | Text marker | Marks a function return event in the timeline |
| Function detail panel | Right panel | Shows args, return value, duration, and call count |
| Jump to source link | Text link | Opens VS Code at the function's exact source line |
| Flame chart | Horizontal bar chart | Visual duration breakdown of the full trace |

### Interactions

- Type in **Entry point input** and click **▶ Run Trace** → populates timeline with dynamic trace data
- Click **■ Stop** → halts trace mid-execution; partial timeline results remain visible
- Click any **timeline row** → selects it; right detail panel updates with that function's args and return
- Click **⏮ Step Back** → moves selection to the previous timeline row
- Click **⏭ Step Fwd** → moves selection to the next timeline row
- Drag **Speed slider** → adjusts animated playback speed of the timeline highlight
- **Hover** a timeline row → tooltip shows full qualified function name and file path
- Click **🔍 Jump to source** → opens VS Code at the function's exact line number
- Click a **flame chart bar** → selects that function's corresponding row in the timeline
- **Keyboard ↑ / ↓** while timeline is focused → navigates rows without clicking

### New Ideas This Run

**1. Argument Diff Between Calls**
When the same function appears multiple times in a trace, a "Diff args" button compares argument values between the first and last invocation, highlighting changes in amber.
Why it helps: Developers debugging stateful mutations can pinpoint exactly where a value changed without adding print statements to the source.

**2. Breakpoint Markers on Timeline**
Right-clicking a timeline row sets a visual breakpoint marker; re-running the trace pauses and highlights at that row automatically.
Why it helps: Learners stepping through complex call sequences can set checkpoints so they don't lose their place in a long trace.

**3. Export Trace as Shareable JSON**
A "Share trace" button downloads the full `execution_traces` record as a portable JSON file that a teammate can import to replay the same trace locally.
Why it helps: Remote teams can share exact trace snapshots when collaborating on debugging without needing to reproduce the same runtime conditions.
