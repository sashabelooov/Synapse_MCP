import fs from 'fs'
import path from 'path'
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

  // Migrate: add is_class column if missing
  try { db.exec('ALTER TABLE functions ADD COLUMN is_class INTEGER DEFAULT 0') } catch {}

  const stats = { files: 0, functions: 0, routes: 0, db_models: 0, devops_files: 0 }

  const projectId = upsertProject(db, resolved, name, framework)
  clearProjectData(db, projectId)

  const pyFiles = collectPythonFiles(resolved)

  // name → id for cross-file call resolution (class names + function names)
  const funcNameToId = new Map<string, number>()

  // First pass: insert files + all functions + classes
  const insertFile = db.prepare(
    'INSERT OR REPLACE INTO files (project_id, path, relative_path, file_role) VALUES (?,?,?,?)'
  )
  const insertFn = db.prepare(`
    INSERT INTO functions (file_id, name, qualified_name, line_start, line_end,
      is_async, is_class, decorators, parameters, return_type, docstring)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `)

  // Track class name → id so we can create class→method edges
  const classNameToId = new Map<string, number>()

  for (const pyFile of pyFiles) {
    const fileInfo = parseFile(pyFile, resolved)
    if (!fileInfo) continue

    const fileResult = insertFile.run(projectId, fileInfo.path, fileInfo.relativePath, fileInfo.fileRole)
    const fileId = fileResult.lastInsertRowid as number
    stats.files++

    for (const fn of fileInfo.functions) {
      const fnResult = insertFn.run(
        fileId, fn.name, fn.qualifiedName, fn.lineStart, fn.lineEnd,
        fn.isAsync ? 1 : 0, fn.isClass ? 1 : 0,
        JSON.stringify(fn.decorators), JSON.stringify(fn.parameters),
        fn.returnType, fn.docstring,
      )
      const fnId = fnResult.lastInsertRowid as number
      funcNameToId.set(fn.qualifiedName, fnId)
      funcNameToId.set(fn.name, fnId)

      if (fn.isClass) {
        classNameToId.set(fn.name, fnId)
        classNameToId.set(fn.qualifiedName, fnId)
      }
      stats.functions++
    }
  }

  // Second pass: insert calls (function bodies + class→method relationships)
  const insertCall = db.prepare(
    'INSERT INTO calls (caller_id, callee_name, callee_id, line_number) VALUES (?,?,?,?)'
  )
  const getFileId = db.prepare('SELECT id FROM files WHERE path=?')
  const getFnByQname = db.prepare('SELECT id FROM functions WHERE qualified_name=?')
  const getFnByName = db.prepare('SELECT id FROM functions WHERE file_id=? AND name=?')

  const insertRoute = db.prepare(
    'INSERT INTO routes (project_id, method, path, handler_id, tags) VALUES (?,?,?,?,?)'
  )
  const insertModel = db.prepare(
    'INSERT INTO db_models (project_id, name, table_name, file_id, fields) VALUES (?,?,?,?,?)'
  )

  for (const pyFile of pyFiles) {
    const fileInfo = parseFile(pyFile, resolved)
    if (!fileInfo) continue

    const fileRow = getFileId.get(pyFile) as { id: number } | undefined
    if (!fileRow) continue

    // Group: for each class, find its methods and create class→method edges
    const classNodes = fileInfo.functions.filter(f => f.isClass)
    const methodNodes = fileInfo.functions.filter(f => !f.isClass)

    for (const cls of classNodes) {
      const classId = (getFnByQname.get(cls.qualifiedName) as { id: number } | undefined)?.id
      if (!classId) continue

      // Find methods that belong to this class (qualified_name starts with module.ClassName.)
      const prefix = cls.qualifiedName + '.'
      for (const method of methodNodes) {
        if (method.qualifiedName.startsWith(prefix)) {
          const methodId = (getFnByQname.get(method.qualifiedName) as { id: number } | undefined)?.id
          if (methodId) {
            insertCall.run(classId, method.name, methodId, method.lineStart)
          }
        }
      }
    }

    // Insert function call edges
    for (const fn of fileInfo.functions) {
      const callerRow = (getFnByQname.get(fn.qualifiedName) as { id: number } | undefined)
        ?? (getFnByName.get(fileRow.id, fn.name) as { id: number } | undefined)
      if (!callerRow) continue

      for (const call of fn.calls) {
        // Try to resolve: exact name, short name, class name
        const calleeId = funcNameToId.get(call.calleeName)
          ?? funcNameToId.get(call.calleeName.split('.').pop()!)
          ?? classNameToId.get(call.calleeName)
          ?? null
        insertCall.run(callerRow.id, call.calleeName, calleeId, call.line)
      }
    }

    // Routes
    for (const route of fileInfo.routes) {
      const handlerId = funcNameToId.get(route.handler) ?? null
      insertRoute.run(projectId, route.method, route.routePath, handlerId, JSON.stringify(route.tags))
      stats.routes++
    }

    // DB models
    for (const model of fileInfo.models) {
      insertModel.run(projectId, model.name, model.tableName, fileRow.id, JSON.stringify(model.fields))
      stats.db_models++
    }
  }

  // DevOps
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
