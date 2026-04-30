import fs from 'fs'
import path from 'path'
import { globSync } from 'glob'
import { getDb, upsertProject, clearProjectData } from '../storage/database.js'
import { parseFile } from './python.js'
import { getDbPath } from '../config.js'
import { detectDevopsFiles, buildDevopsGraph } from './devops.js'

const SKIP_DIRS = new Set([
  '.git', '__pycache__', '.venv', 'venv', 'env', 'node_modules',
  'migrations', '.mcp_mental_model', 'dist', 'build', '.mypy_cache',
  '.pytest_cache', 'htmlcov', '.tox',
])

export function detectFramework(projectPath: string): string {
  if (fs.existsSync(path.join(projectPath, 'manage.py'))) return 'django'
  const pyFiles = collectPythonFiles(projectPath).slice(0, 30)
  for (const f of pyFiles) {
    try {
      const src = fs.readFileSync(f, 'utf8')
      if (src.includes('FastAPI') || src.includes('fastapi')) return 'fastapi'
    } catch {}
  }
  return 'unknown'
}

export function collectPythonFiles(projectPath: string): string[] {
  const results: string[] = []
  function walk(dir: string) {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.isFile() && e.name.endsWith('.py')) results.push(full)
    }
  }
  walk(projectPath)
  return results.sort()
}

export function buildTreeNode(dirPath: string): object {
  function node(p: string): object {
    const stat = fs.statSync(p)
    if (stat.isFile()) return { name: path.basename(p), type: 'file', path: p }
    const children: object[] = []
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(p, { withFileTypes: true }) } catch { entries = [] }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP_DIRS.has(e.name)) continue
      children.push(node(path.join(p, e.name)))
    }
    return { name: path.basename(p), type: 'dir', path: p, children }
  }
  return node(dirPath)
}

export function analyzeProject(projectPath: string): object {
  const resolved = path.resolve(projectPath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ok: false, error: `Not a directory: ${projectPath}` }
  }

  const framework = detectFramework(resolved)
  const name = path.basename(resolved)
  const dbPath = getDbPath(resolved)
  const db = getDb(dbPath)

  const stats = { files: 0, functions: 0, routes: 0, db_models: 0, devops_files: 0 }

  const projectId = upsertProject(db, resolved, name, framework)
  clearProjectData(db, projectId)

  const pyFiles = collectPythonFiles(resolved)
  const funcNameToId = new Map<string, number>()

  // First pass: insert files and functions
  const insertFile = db.prepare(
    'INSERT OR REPLACE INTO files (project_id, path, relative_path, file_role) VALUES (?,?,?,?)'
  )
  const insertFn = db.prepare(`
    INSERT INTO functions (file_id, name, qualified_name, line_start, line_end,
      is_async, decorators, parameters, return_type, docstring)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `)

  for (const pyFile of pyFiles) {
    const fileInfo = parseFile(pyFile, resolved)
    if (!fileInfo) continue

    const fileResult = insertFile.run(projectId, fileInfo.path, fileInfo.relativePath, fileInfo.fileRole)
    const fileId = fileResult.lastInsertRowid as number
    stats.files++

    for (const fn of fileInfo.functions) {
      const fnResult = insertFn.run(
        fileId, fn.name, fn.qualifiedName, fn.lineStart, fn.lineEnd,
        fn.isAsync ? 1 : 0, JSON.stringify(fn.decorators),
        JSON.stringify(fn.parameters), fn.returnType, fn.docstring
      )
      const fnId = fnResult.lastInsertRowid as number
      funcNameToId.set(fn.qualifiedName, fnId)
      funcNameToId.set(fn.name, fnId)
      stats.functions++
    }
  }

  // Second pass: insert calls with resolved callee IDs
  const insertCall = db.prepare(
    'INSERT INTO calls (caller_id, callee_name, callee_id, line_number) VALUES (?,?,?,?)'
  )
  const getFileId = db.prepare('SELECT id FROM files WHERE path=?')
  const getFnId = db.prepare('SELECT id FROM functions WHERE file_id=? AND name=?')

  for (const pyFile of pyFiles) {
    const fileInfo = parseFile(pyFile, resolved)
    if (!fileInfo) continue

    const fileRow = getFileId.get(pyFile) as { id: number } | undefined
    if (!fileRow) continue

    for (const fn of fileInfo.functions) {
      const callerRow = getFnId.get(fileRow.id, fn.name) as { id: number } | undefined
      if (!callerRow) continue

      for (const call of fn.calls) {
        const calleeId = funcNameToId.get(call.calleeName) ?? null
        insertCall.run(callerRow.id, call.calleeName, calleeId, call.line)
      }
    }

    // Insert routes
    const insertRoute = db.prepare(
      'INSERT INTO routes (project_id, method, path, handler_id, tags) VALUES (?,?,?,?,?)'
    )
    for (const route of fileInfo.routes) {
      const handlerId = funcNameToId.get(route.handler) ?? null
      insertRoute.run(projectId, route.method, route.routePath, handlerId, JSON.stringify(route.tags))
      stats.routes++
    }

    // Insert DB models
    const insertModel = db.prepare(
      'INSERT INTO db_models (project_id, name, table_name, file_id, fields) VALUES (?,?,?,?,?)'
    )
    for (const model of fileInfo.models) {
      insertModel.run(projectId, model.name, model.tableName, fileRow.id, JSON.stringify(model.fields))
      stats.db_models++
    }
  }

  // DevOps analysis
  const devopsFiles = detectDevopsFiles(resolved)
  if (devopsFiles.length > 0) {
    stats.devops_files = devopsFiles.length
    const devopsGraph = buildDevopsGraph(devopsFiles)
    db.prepare(
      'INSERT INTO execution_traces (project_id, label, entry_point, trace_data) VALUES (?,?,?,?)'
    ).run(projectId, '__devops__', '__devops__', JSON.stringify({ files: devopsFiles, graph: devopsGraph }))
  }

  return { ok: true, framework, name, stats }
}
