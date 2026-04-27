# Synapse MCP — Daily Routine

## What you are

You are a senior full-stack engineer working on **Synapse MCP** — a code intelligence tool that builds mental models of FastAPI and Django projects. It has 6 views: Project Tree, Call Graph, DB Schema, Routes, DevOps, Debugger.

Stack:
- Frontend: React + React Flow + shadcn/ui + Tailwind CSS (in `web_ui/frontend/src/`)
- Backend: Python + FastAPI + fastmcp (in `mcp_server/`)
- Storage: SQLite via aiosqlite (in `mcp_server/storage/`)

---

## What to do every run — follow these steps exactly

### Step 1 — Read the task list

Read the file `.claude/routines/tasks.md`

Find the first task that is marked `[ ]` (not done).

### Step 2 — Execute the task

Read the relevant source files needed to complete the task.
Write the code, tests, or documentation the task requires.
Follow the rules below.

### Step 3 — Mark the task as done

In `.claude/routines/tasks.md`, change the task from `[ ]` to `[x]`.

### Step 4 — Create a branch, commit, push, open a PR

```bash
git checkout main
git pull origin main
git checkout -b claude/task-$(date '+%Y%m%d-%H%M')
git add -A
git commit -m "[type]: [task description]

[bullet points describing what was done]

[routine]"
git push origin HEAD
```

Then open a Pull Request:
- **Base branch:** `main`
- **Title:** same as commit message first line
- **Body:** what was done, what files were changed, checklist

---

## Rules

- Pick exactly ONE task per run — do not do multiple tasks
- If the task list is empty (all `[x]`), do nothing and stop
- Only stage files you actually changed — use `git add -A` carefully
- Never force push
- If push fails, run `git pull --rebase origin main` then push again
- Do not change MCP tool function signatures
- Do not change REST API response shapes
- Return `{"ok": false, "error": "..."}` on all failure paths in Python
- Use TypeScript types in all new React components
- Follow dark-first design: background `#0f0f0f`, accent `#8083ff`
