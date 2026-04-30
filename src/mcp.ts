import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import path from 'path'
import { analyzeProject, buildTreeNode } from './analyzer/index.js'
import { getDb } from './storage/database.js'
import { getDbPath } from './config.js'
import { buildCallGraph, buildDbGraph, getReachableIds } from './graph/builder.js'
import { open } from 'open'
import { UI_HOST, UI_PORT } from './config.js'

const server = new McpServer({
  name: 'synapse-mcp',
  version: '1.0.0',
})

server.tool(
  'analyze_project',
  'Analyze a FastAPI or Django project. Performs full static analysis: project tree, function call graph, database models, API routes, and DevOps files. Must be called before any other tool.',
  { path: z.string().describe('Absolute path to the project directory') },
  async ({ path: projectPath }) => {
    const result = analyzeProject(projectPath)
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  }
)

server.tool(
  'get_project_tree',
  'Return the directory/file tree of the project as nested JSON.',
  { path: z.string() },
  async ({ path: projectPath }) => {
    const tree = buildTreeNode(path.resolve(projectPath))
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, tree }) }] }
  }
)

server.tool(
  'get_call_graph',
  'Return the function call graph as React Flow nodes and edges. Optionally filter to subgraph starting from a function.',
  {
    path: z.string(),
    function_name: z.string().optional(),
  },
  async ({ path: projectPath, function_name }) => {
    const dbPath = getDbPath(projectPath)
    const db = getDb(dbPath)
    const project = db.prepare('SELECT * FROM projects WHERE path=?').get(path.resolve(projectPath)) as any
    if (!project) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Project not analyzed yet.' }) }] }

    let functions: any[]
    let calls: any[]
    const pid = project.id

    if (function_name) {
      const startFn = db.prepare(
        'SELECT f.*, fi.file_role, fi.relative_path FROM functions f JOIN files fi ON fi.id=f.file_id WHERE f.name=? AND fi.project_id=?'
      ).get(function_name, pid) as any
      if (!startFn) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: `Function not found: ${function_name}` }) }] }

      const ids = getReachableIds(db, startFn.id, 6)
      const ph = Array.from(ids).map(() => '?').join(',')
      functions = db.prepare(`SELECT f.*, fi.file_role, fi.relative_path FROM functions f JOIN files fi ON fi.id=f.file_id WHERE f.id IN (${ph})`).all(...ids) as any[]
      calls = db.prepare(`SELECT * FROM calls WHERE caller_id IN (${ph})`).all(...ids) as any[]
    } else {
      functions = db.prepare('SELECT f.*, fi.file_role, fi.relative_path FROM functions f JOIN files fi ON fi.id=f.file_id WHERE fi.project_id=?').all(pid) as any[]
      calls = db.prepare('SELECT c.* FROM calls c JOIN functions f ON f.id=c.caller_id JOIN files fi ON fi.id=f.file_id WHERE fi.project_id=?').all(pid) as any[]
    }

    const graph = buildCallGraph(functions, calls)
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...graph }) }] }
  }
)

server.tool(
  'get_db_schema',
  'Return all detected ORM models (SQLAlchemy, SQLModel, Django ORM).',
  { path: z.string() },
  async ({ path: projectPath }) => {
    const dbPath = getDbPath(projectPath)
    const db = getDb(dbPath)
    const project = db.prepare('SELECT * FROM projects WHERE path=?').get(path.resolve(projectPath)) as any
    if (!project) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Project not analyzed yet.' }) }] }

    const models = db.prepare('SELECT * FROM db_models WHERE project_id=?').all(project.id) as any[]
    for (const m of models) {
      if (typeof m.fields === 'string') m.fields = JSON.parse(m.fields)
    }
    const graph = buildDbGraph(models)
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, models, ...graph }) }] }
  }
)

server.tool(
  'get_routes',
  'Return all API routes detected in the project.',
  { path: z.string() },
  async ({ path: projectPath }) => {
    const dbPath = getDbPath(projectPath)
    const db = getDb(dbPath)
    const project = db.prepare('SELECT * FROM projects WHERE path=?').get(path.resolve(projectPath)) as any
    if (!project) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Project not analyzed yet.' }) }] }

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

    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, routes }) }] }
  }
)

server.tool(
  'get_devops',
  'Return DevOps/infra files detected in the project (Docker, CI/CD, Kubernetes, etc.).',
  { path: z.string() },
  async ({ path: projectPath }) => {
    const dbPath = getDbPath(projectPath)
    const db = getDb(dbPath)
    const project = db.prepare('SELECT * FROM projects WHERE path=?').get(path.resolve(projectPath)) as any
    if (!project) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Project not analyzed yet.' }) }] }

    const row = db.prepare(
      "SELECT trace_data FROM execution_traces WHERE project_id=? AND label='__devops__' ORDER BY id DESC LIMIT 1"
    ).get(project.id) as any

    if (!row) return { content: [{ type: 'text', text: JSON.stringify({ ok: true, files: [], nodes: [], edges: [] }) }] }

    const data = JSON.parse(row.trace_data)
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, files: data.files ?? [], ...(data.graph ?? {}) }) }] }
  }
)

server.tool(
  'open_ui',
  'Open the Synapse visual interface in the browser.',
  {},
  async () => {
    const url = `http://${UI_HOST}:${UI_PORT}`
    await open(url)
    return { content: [{ type: 'text', text: `Opened ${url}` }] }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
