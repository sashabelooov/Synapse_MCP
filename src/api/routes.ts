import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { getDbPath } from '../config.js'
import { getDb } from '../storage/database.js'
import { analyzeProject, buildTreeNode, collectPythonFiles } from '../analyzer/index.js'
import { buildCallGraph, buildDbGraph, getReachableIds } from '../graph/builder.js'

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

// POST /api/trace — minimal stub (dynamic tracing requires running Python, skip for now)
router.post('/trace', (req: Request, res: Response) => {
  res.json({ ok: false, error: 'Dynamic tracing requires Python runtime. Use the Python MCP server for this feature.' })
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

export default router
