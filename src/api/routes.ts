import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getDbPath } from '../config.js'
import { getDb } from '../storage/database.js'
import { analyzeProject, buildTreeNode } from '../analyzer/index.js'
import { buildCallGraph, buildDbGraph, getReachableIds } from '../graph/builder.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIAGRAMS_DIR = path.resolve(__dirname, '../../data/diagrams')
if (!fs.existsSync(DIAGRAMS_DIR)) fs.mkdirSync(DIAGRAMS_DIR, { recursive: true })

const ARCHITECT_SYSTEM_PROMPT = `You are an AI architecture diagram generator for Synapse, a code intelligence tool.
Your job: help engineers visualize their system architecture as interactive diagrams.

## PHASE 1 — Clarification (ONLY for the very first user message)
Ask exactly 1-2 short, targeted questions. Keep it conversational. Do NOT output a diagram yet.

## PHASE 2 — Generate diagram
Once you understand the system, output the complete diagram JSON wrapped in <DIAGRAM> tags.
Announce it naturally first (e.g. "Here's your architecture diagram:"), then output:

<DIAGRAM>
{
  "name": "System Name",
  "description": "One-line description",
  "nodes": [
    { "id": "n1", "icon": "react", "label": "React App", "nodeType": "client", "color": "#61dafb", "x": 100, "y": 200 }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "label": "REST", "style": "solid" }
  ],
  "groups": [
    { "id": "g1", "label": "Frontend", "nodeIds": ["n1"], "color": "#58a6ff" }
  ]
}
</DIAGRAM>

## Available icons (use in "icon" field)
Tech: react, nextjs, vuejs, nodejs, python, fastapi, django, flask, spring, springboot,
      postgresql, mysql, mongodb, redis, kafka, rabbitmq, elasticsearch,
      docker, kubernetes, nginx, grafana, prometheus, firebase, supabase,
      stripe, github, typescript, angular
System: server, database, queue, gateway, client, cache, storage, load-balancer, mobile, browser

## nodeType options
client, service, database, queue, gateway, cache, storage, mobile

## Layout rules
- Spread nodes: x 50–1200, y 50–700, min 180px apart
- Client/frontend left, databases/storage right
- Use groups to label logical layers`

const router = Router()

// POST /api/analyze
router.post('/analyze', (req: Request, res: Response) => {
  try {
    const { path: projectPath } = req.body
    if (!projectPath) return res.status(400).json({ ok: false, error: 'path required' })
    const result = analyzeProject(projectPath)
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/tree
router.get('/tree', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string
    if (!projectPath) return res.status(400).json({ ok: false, error: 'path required' })
    const tree = buildTreeNode(path.resolve(projectPath))
    res.json({ ok: true, tree })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/call-graph
router.get('/call-graph', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string
    const functionName = req.query.function_name as string | undefined
    if (!projectPath) return res.status(400).json({ ok: false, error: 'path required' })

    const dbPath = getDbPath(projectPath)
    const db = getDb(dbPath)

    const project = db.prepare('SELECT * FROM projects WHERE path=?').get(path.resolve(projectPath)) as any
    if (!project) return res.json({ ok: false, error: 'Project not analyzed yet. Run analyze first.' })

    const pid = project.id

    let functions: any[]
    let calls: any[]

    if (functionName) {
      const startFn = db.prepare(
        'SELECT f.*, fi.file_role, fi.relative_path FROM functions f JOIN files fi ON fi.id=f.file_id WHERE f.name=? AND fi.project_id=?'
      ).get(functionName, pid) as any
      if (!startFn) return res.json({ ok: false, error: `Function not found: ${functionName}` })

      const ids = getReachableIds(db, startFn.id, 6)
      const placeholders = Array.from(ids).map(() => '?').join(',')
      functions = db.prepare(
        `SELECT f.*, fi.file_role, fi.relative_path FROM functions f JOIN files fi ON fi.id=f.file_id WHERE f.id IN (${placeholders})`
      ).all(...ids) as any[]
      calls = db.prepare(
        `SELECT * FROM calls WHERE caller_id IN (${placeholders})`
      ).all(...ids) as any[]
    } else {
      functions = db.prepare(
        'SELECT f.*, fi.file_role, fi.relative_path FROM functions f JOIN files fi ON fi.id=f.file_id WHERE fi.project_id=?'
      ).all(pid) as any[]
      calls = db.prepare(
        'SELECT c.* FROM calls c JOIN functions f ON f.id=c.caller_id JOIN files fi ON fi.id=f.file_id WHERE fi.project_id=?'
      ).all(pid) as any[]
    }

    const graph = buildCallGraph(functions, calls)
    res.json({ ok: true, ...graph })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/db-schema
router.get('/db-schema', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string
    if (!projectPath) return res.status(400).json({ ok: false, error: 'path required' })

    const dbPath = getDbPath(projectPath)
    const db = getDb(dbPath)

    const project = db.prepare('SELECT * FROM projects WHERE path=?').get(path.resolve(projectPath)) as any
    if (!project) return res.json({ ok: false, error: 'Project not analyzed yet.' })

    const models = db.prepare('SELECT * FROM db_models WHERE project_id=?').all(project.id) as any[]
    for (const m of models) {
      if (typeof m.fields === 'string') m.fields = JSON.parse(m.fields)
    }

    const graph = buildDbGraph(models)
    res.json({ ok: true, models, ...graph })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/routes
router.get('/routes', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string
    if (!projectPath) return res.status(400).json({ ok: false, error: 'path required' })

    const dbPath = getDbPath(projectPath)
    const db = getDb(dbPath)

    const project = db.prepare('SELECT * FROM projects WHERE path=?').get(path.resolve(projectPath)) as any
    if (!project) return res.json({ ok: false, error: 'Project not analyzed yet.' })

    const routes = db.prepare(`
      SELECT r.*, f.name as handler_name, f.qualified_name, fi.relative_path
      FROM routes r
      LEFT JOIN functions f ON f.id=r.handler_id
      LEFT JOIN files fi ON fi.id=f.file_id
      WHERE r.project_id=?
    `).all(project.id) as any[]

    for (const r of routes) {
      if (typeof r.tags === 'string') r.tags = JSON.parse(r.tags)
    }

    res.json({ ok: true, routes })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/devops
router.get('/devops', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string
    if (!projectPath) return res.status(400).json({ ok: false, error: 'path required' })

    const dbPath = getDbPath(projectPath)
    const db = getDb(dbPath)

    const project = db.prepare('SELECT * FROM projects WHERE path=?').get(path.resolve(projectPath)) as any
    if (!project) return res.json({ ok: false, error: 'Project not analyzed yet.' })

    const row = db.prepare(
      "SELECT trace_data FROM execution_traces WHERE project_id=? AND label='__devops__' ORDER BY id DESC LIMIT 1"
    ).get(project.id) as any

    if (!row) return res.json({ ok: true, files: [], nodes: [], edges: [] })

    const data = JSON.parse(row.trace_data)
    res.json({ ok: true, files: data.files ?? [], ...(data.graph ?? { nodes: [], edges: [] }) })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// POST /api/trace — minimal stub
router.post('/trace', (_req: Request, res: Response) => {
  res.json({ ok: false, error: 'Use /api/run-code for code execution tracing.' })
})

// POST /api/run-code — execute Python code and trace line-by-line execution
router.post('/run-code', (req: Request, res: Response) => {
  const { code } = req.body
  if (!code || typeof code !== 'string') return res.status(400).json({ ok: false, error: 'code required' })
  if (code.length > 50_000) return res.status(400).json({ ok: false, error: 'Code too large (max 50KB)' })

  const TRACER = `
import sys, json, time, io

_events = []
_start = time.perf_counter()
_user_src = "<user_code>"
_buf = io.StringIO()

def _capture_locals(frame):
    locs = {}
    try:
        for k, v in frame.f_locals.items():
            if k.startswith('_'): continue
            try:
                r = repr(v)
                locs[k] = r if len(r) <= 200 else r[:200] + '…'
            except:
                locs[k] = '<?>'
    except: pass
    return locs

def _tracer(frame, event, arg):
    if frame.f_code.co_filename == _user_src and event in ("call", "line", "return"):
        _events.append({
            "event": event,
            "line": frame.f_lineno,
            "name": frame.f_code.co_name,
            "locals": _capture_locals(frame),
            "elapsed_ms": round((time.perf_counter() - _start) * 1000, 2)
        })
    return _tracer

_globals = {"__name__": "__main__"}
_code_str = sys.stdin.read()
_compiled = compile(_code_str, _user_src, "exec")

_real_stdout = sys.stdout
sys.stdout = _buf
sys.settrace(_tracer)
try:
    exec(_compiled, _globals)
except Exception as e:
    import traceback
    _events.append({"event": "error", "line": 0, "name": "error",
                    "error": str(e), "traceback": traceback.format_exc(), "elapsed_ms": 0})
finally:
    sys.settrace(None)
    sys.stdout = _real_stdout

_real_stdout.write(json.dumps({"events": _events, "stdout": _buf.getvalue()}) + "\\n")
`

  try {
    const tmpTracer = path.join(os.tmpdir(), `synapse_tracer_${Date.now()}.py`)
    fs.writeFileSync(tmpTracer, TRACER)

    const result = spawnSync('python3', [tmpTracer], {
      input: code,
      encoding: 'utf8',
      timeout: 10_000,
    })

    fs.unlinkSync(tmpTracer)

    if (result.error) return res.json({ ok: false, error: result.error.message })
    if (result.status !== 0 && !result.stdout) {
      return res.json({ ok: false, error: result.stderr || 'Python execution failed' })
    }

    const parsed = JSON.parse(result.stdout || '{"events":[],"stdout":""}')
    const stderr = result.stderr || ''
    res.json({ ok: true, events: parsed.events, stdout: parsed.stdout, stderr })
  } catch (e: any) {
    res.json({ ok: false, error: e.message })
  }
})

// GET /api/traces
router.get('/traces', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string
    if (!projectPath) return res.status(400).json({ ok: false, error: 'path required' })

    const dbPath = getDbPath(projectPath)
    const db = getDb(dbPath)

    const project = db.prepare('SELECT * FROM projects WHERE path=?').get(path.resolve(projectPath)) as any
    if (!project) return res.json({ ok: false, error: 'Project not analyzed yet.' })

    const traces = db.prepare(
      "SELECT id, label, entry_point, created_at FROM execution_traces WHERE project_id=? AND label != '__devops__' ORDER BY id DESC"
    ).all(project.id)

    res.json({ ok: true, traces })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/trace/:id
router.get('/trace/:id', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string
    const traceId = parseInt(req.params.id)
    if (!projectPath) return res.status(400).json({ ok: false, error: 'path required' })

    const dbPath = getDbPath(projectPath)
    const db = getDb(dbPath)

    const row = db.prepare('SELECT * FROM execution_traces WHERE id=?').get(traceId) as any
    if (!row) return res.json({ ok: false, error: 'Trace not found' })

    row.trace_data = JSON.parse(row.trace_data)
    res.json({ ok: true, ...row })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/function-source
router.get('/function-source', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string
    const file = req.query.file as string
    const lineStart = req.query.line_start ? parseInt(req.query.line_start as string) : null
    const lineEnd = req.query.line_end ? parseInt(req.query.line_end as string) : null
    if (!projectPath || !file) return res.status(400).json({ ok: false, error: 'path and file required' })

    const filePath = path.join(path.resolve(projectPath), file)
    if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'File not found' })

    const lines = fs.readFileSync(filePath, 'utf8').split('\n')
    const start = Math.max(0, (lineStart ?? 1) - 1)
    const end = Math.min(lines.length, lineEnd ?? start + 30)
    const source = lines.slice(start, end).join('\n')

    res.json({ ok: true, source, line_start: start + 1, line_end: end })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// GET /api/projects
router.get('/projects', (_req: Request, res: Response) => {
  res.json({ projects: [] })
})

const CLAUDE_CLI = process.env.CLAUDE_CLI_PATH || 'claude'

// ─── Architect: AI Chat ──────────────────────────────────────────────────────
router.post('/architect/chat', async (req: Request, res: Response) => {
  try {
    const { messages, model = 'claude' } = req.body
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ ok: false, error: 'messages array required' })
    }

    let reply = ''

    if (model === 'openai') {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: ARCHITECT_SYSTEM_PROMPT }, ...messages],
        max_tokens: 4096,
      })
      reply = completion.choices[0].message.content ?? ''

    } else if (model === 'claude-cli') {
      // Format conversation for Claude Code CLI
      const conversation = (messages as any[])
        .map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
        .join('\n\n')
      const prompt = `${ARCHITECT_SYSTEM_PROMPT}\n\n---\n\n${conversation}\n\nAssistant:`

      // Claude CLI has its own auth — don't pass ANTHROPIC_API_KEY or it'll reject a placeholder
      const { ANTHROPIC_API_KEY: _omit, ...cliEnv } = process.env
      const result = spawnSync(CLAUDE_CLI, [
        '-p',
        '--model', 'sonnet',
        '--no-session-persistence',
        '--output-format', 'text',
      ], {
        input: prompt,
        encoding: 'utf8',
        timeout: 120_000,
        env: { ...cliEnv, HOME: cliEnv.HOME || os.homedir() },
      })

      if (result.error) throw result.error
      if (result.status !== 0 && !result.stdout) {
        throw new Error(result.stderr?.trim() || 'Claude CLI returned no output')
      }
      reply = result.stdout?.trim() || ''

    } else {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: ARCHITECT_SYSTEM_PROMPT,
        messages,
      })
      reply = msg.content[0].type === 'text' ? msg.content[0].text : ''
    }

    const match = reply.match(/<DIAGRAM>([\s\S]*?)<\/DIAGRAM>/)
    if (match) {
      try {
        const diagram = JSON.parse(match[1].trim())
        const text = reply.slice(0, reply.indexOf('<DIAGRAM>')).trim()
        return res.json({ ok: true, message: text || 'Here is your architecture diagram:', diagram })
      } catch {
        return res.json({ ok: true, message: reply })
      }
    }

    res.json({ ok: true, message: reply })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ─── Architect: Save diagram ─────────────────────────────────────────────────
router.post('/architect/diagrams', (req: Request, res: Response) => {
  try {
    const { diagram } = req.body
    if (!diagram) return res.status(400).json({ ok: false, error: 'diagram required' })
    const id = diagram.id || `diag_${Date.now()}`
    const now = new Date().toISOString()
    const toSave = { ...diagram, id, updatedAt: now, createdAt: diagram.createdAt || now }
    fs.writeFileSync(path.join(DIAGRAMS_DIR, `${id}.json`), JSON.stringify(toSave, null, 2))
    res.json({ ok: true, id })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ─── Architect: List diagrams ─────────────────────────────────────────────────
router.get('/architect/diagrams', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined
    const files = fs.existsSync(DIAGRAMS_DIR)
      ? fs.readdirSync(DIAGRAMS_DIR).filter(f => f.endsWith('.json'))
      : []
    const diagrams = files
      .map(f => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(DIAGRAMS_DIR, f), 'utf8'))
          return { id: d.id, name: d.name, description: d.description, projectPath: d.projectPath, createdAt: d.createdAt, updatedAt: d.updatedAt }
        } catch { return null }
      })
      .filter(Boolean)
      .filter(d => !projectPath || (d as any).projectPath === projectPath)
    res.json({ ok: true, diagrams })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ─── Architect: Get diagram ───────────────────────────────────────────────────
router.get('/architect/diagrams/:id', (req: Request, res: Response) => {
  try {
    const p = path.join(DIAGRAMS_DIR, `${req.params.id}.json`)
    if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: 'Not found' })
    res.json({ ok: true, diagram: JSON.parse(fs.readFileSync(p, 'utf8')) })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ─── Architect: Delete diagram ────────────────────────────────────────────────
router.delete('/architect/diagrams/:id', (req: Request, res: Response) => {
  try {
    const p = path.join(DIAGRAMS_DIR, `${req.params.id}.json`)
    if (fs.existsSync(p)) fs.unlinkSync(p)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
