import { inferRole } from './roles.js'
import path from 'path'
import fs from 'fs'

export interface FunctionInfo {
  name: string
  qualifiedName: string
  lineStart: number
  lineEnd: number
  isAsync: boolean
  isClass: boolean        // true for class definitions
  decorators: string[]
  parameters: string[]
  returnType: string | null
  docstring: string | null
  calls: Array<{ calleeName: string; line: number }>
}

export interface RouteInfo {
  method: string
  routePath: string
  handler: string
  tags: string[]
}

export interface ModelField { name: string; type: string }
export interface ModelInfo {
  name: string; tableName: string; file: string; fields: ModelField[]
}

export interface FileInfo {
  path: string
  relativePath: string
  fileRole: string
  functions: FunctionInfo[]  // includes class nodes + top-level functions
  routes: RouteInfo[]
  models: ModelInfo[]
}

export function parseFile(filePath: string, projectRoot: string): FileInfo | null {
  let source: string
  try { source = fs.readFileSync(filePath, 'utf8') } catch { return null }

  const relativePath = path.relative(projectRoot, filePath)
  const fileRole = inferRole(filePath)
  const moduleName = path.basename(filePath, '.py')

  const functions = extractAll(source, moduleName)
  const routes = extractRoutes(source)
  const models = extractModels(source, filePath)

  return { path: filePath, relativePath, fileRole, functions, routes, models }
}

// ── Extract all classes AND top-level functions ───────────────────────────────
function extractAll(source: string, moduleName: string): FunctionInfo[] {
  const lines = source.split('\n')
  const result: FunctionInfo[] = []
  const classRanges: Array<{ start: number; end: number; name: string }> = []

  // First: find all class definitions at indent=0
  const classRe = /^class\s+(\w+)(?:\s*\([^)]*\))?\s*:/
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(classRe)
    if (m) {
      const className = m[1]
      const classStart = i
      // Find class body end (next top-level non-blank line)
      let classEnd = i + 1
      let j = i + 1
      while (j < lines.length) {
        const l = lines[j]
        if (l.trim() === '') { j++; continue }
        const ind = l.match(/^( *)/)?.[1].length ?? 0
        if (ind === 0) break
        classEnd = j + 1
        j++
      }
      classRanges.push({ start: classStart, end: classEnd, name: className })

      // Class node itself
      const bodyLines = lines.slice(classStart + 1, classEnd)
      const classCalls = extractCallsFromBody(bodyLines, classStart + 1)
      const decorators = collectDecorators(lines, classStart, 0)
      // Extract docstring
      let docstring: string | null = null
      const bodyStr = bodyLines.slice(0, 5).join('\n')
      const dm = bodyStr.match(/^\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/)
      if (dm) docstring = (dm[1] || dm[2]).trim()

      // Bases as return type (so graph builder knows what it extends)
      const basesMatch = lines[classStart].match(/class\s+\w+\s*\(([^)]+)\)/)
      const bases = basesMatch ? basesMatch[1].trim() : null

      result.push({
        name: className,
        qualifiedName: `${moduleName}.${className}`,
        lineStart: classStart + 1,
        lineEnd: classEnd,
        isAsync: false,
        isClass: true,
        decorators,
        parameters: [],
        returnType: bases,
        docstring,
        calls: classCalls,
      })

      // Methods inside class
      const methods = extractFunctionsInRange(lines, classStart + 1, classEnd, moduleName, className, 4)
      result.push(...methods)

      i = classEnd
      continue
    }
    i++
  }

  // Top-level functions (not inside any class)
  const topFns = extractFunctionsInRange(lines, 0, lines.length, moduleName, null, 0)
  for (const fn of topFns) {
    // Skip if inside a class range
    const inside = classRanges.some(r => fn.lineStart >= r.start + 1 && fn.lineEnd <= r.end)
    if (!inside) result.push(fn)
  }

  return result
}

function extractFunctionsInRange(
  lines: string[],
  fromLine: number,
  toLine: number,
  moduleName: string,
  className: string | null,
  expectedIndent: number,
): FunctionInfo[] {
  const result: FunctionInfo[] = []
  const fnRe = /^( *)(async )?def (\w+)\(([^)]*(?:\([^)]*\)[^)]*)*)\)(?:\s*->\s*([^:]+))?:/
  const decRe = /^( *)@(.+)/

  let i = fromLine
  while (i < toLine) {
    const line = lines[i]
    const m = line.match(fnRe)
    if (m) {
      const indent = m[1].length
      if (indent !== expectedIndent) { i++; continue }

      const isAsync = !!m[2]
      const name = m[3]
      if (name === '__init__' || name === '__str__' || name === '__repr__') { i++; continue }
      const paramsStr = m[4]
      const returnType = m[5]?.trim() || null
      const lineStart = i + 1

      const decorators = collectDecorators(lines, i, indent)

      const parameters = paramsStr
        .split(',')
        .map(p => p.trim().split(':')[0].split('=')[0].trim())
        .filter(p => p && p !== 'self' && p !== 'cls' && !p.startsWith('*'))

      // Find end of function
      let lineEnd = lineStart
      let j = i + 1
      while (j < Math.min(toLine, lines.length)) {
        const bl = lines[j]
        if (bl.trim() === '') { j++; continue }
        const bi = bl.match(/^( *)/)?.[1].length ?? 0
        if (bi <= indent) break
        lineEnd = j + 1
        j++
      }

      let docstring: string | null = null
      const bodySlice = lines.slice(i + 1, Math.min(i + 6, lineEnd)).join('\n')
      const dm = bodySlice.match(/^\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/)
      if (dm) docstring = (dm[1] || dm[2]).trim()

      const bodyLines = lines.slice(i + 1, lineEnd)
      const calls = extractCallsFromBody(bodyLines, i + 1)

      const qualifiedName = className
        ? `${moduleName}.${className}.${name}`
        : `${moduleName}.${name}`

      result.push({
        name,
        qualifiedName,
        lineStart,
        lineEnd,
        isAsync,
        isClass: false,
        decorators,
        parameters,
        returnType,
        docstring,
        calls,
      })

      i = lineEnd
      continue
    }
    i++
  }
  return result
}

function collectDecorators(lines: string[], fnLine: number, indent: number): string[] {
  const decRe = /^( *)@(.+)/
  const decorators: string[] = []
  let d = fnLine - 1
  while (d >= 0) {
    const dm = lines[d].match(decRe)
    if (dm && dm[1].length === indent) {
      decorators.unshift('@' + dm[2].trim())
      d--
    } else break
  }
  return decorators
}

function extractCallsFromBody(bodyLines: string[], base: number): Array<{ calleeName: string; line: number }> {
  const calls: Array<{ calleeName: string; line: number }> = []
  const callRe = /\b((?:[A-Z]\w*|[a-z]\w+)(?:\.\w+)*)\s*\(/g
  const skip = new Set(['if', 'while', 'for', 'with', 'assert', 'print', 'len',
    'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'range',
    'type', 'isinstance', 'super', 'hasattr', 'getattr', 'setattr', 'open',
    'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'next', 'iter',
    'min', 'max', 'sum', 'abs', 'round'])

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]
    let m: RegExpExecArray | null
    while ((m = callRe.exec(line)) !== null) {
      const name = m[1]
      const base_name = name.split('.')[0]
      if (!skip.has(base_name) && !skip.has(name)) {
        calls.push({ calleeName: name, line: base + i })
      }
    }
    callRe.lastIndex = 0
  }
  return calls
}

function extractRoutes(source: string): RouteInfo[] {
  const routes: RouteInfo[] = []
  const routeRe = /@(?:app|router|blueprint)\.(get|post|put|patch|delete|head|options)\s*\(\s*["']([^"']+)["']([^)]*)\)/gi
  const funcRe = /\ndef\s+(\w+)\s*\(/
  let m: RegExpExecArray | null
  while ((m = routeRe.exec(source)) !== null) {
    const method = m[1].toUpperCase()
    const routePath = m[2]
    const rest = m[3] || ''
    const afterDecorator = source.slice(m.index + m[0].length)
    const fnMatch = afterDecorator.match(funcRe)
    const handler = fnMatch?.[1] || 'unknown'
    const tagsMatch = rest.match(/tags\s*=\s*\[([^\]]*)\]/)
    const tags = tagsMatch
      ? tagsMatch[1].match(/["']([^"']+)["']/g)?.map(t => t.replace(/["']/g, '')) ?? []
      : []
    routes.push({ method, routePath, handler, tags })
  }
  return routes
}

function extractModels(source: string, filePath: string): ModelInfo[] {
  const models: ModelInfo[] = []
  const classRe = /^class\s+(\w+)\s*\(([^)]*)\)\s*:/gm
  const tableNameRe = /__tablename__\s*=\s*["']([^"']+)["']/
  let m: RegExpExecArray | null
  while ((m = classRe.exec(source)) !== null) {
    const className = m[1]
    const bases = m[2]
    const isModel = /Base|SQLModel|DeclarativeBase|Model/.test(bases)
    if (!isModel) continue
    const bodyStart = m.index + m[0].length
    const nextClass = source.slice(bodyStart).match(/\nclass\s+/)
    const bodyEnd = nextClass ? bodyStart + nextClass.index! : source.length
    const body = source.slice(bodyStart, bodyEnd)
    const tableNameMatch = body.match(tableNameRe)
    const tableName = tableNameMatch ? tableNameMatch[1] : className.toLowerCase() + 's'
    const fields: ModelField[] = []
    for (const line of body.split('\n').slice(1)) {
      if (!line.trim() || line.trim().startsWith('#') || line.trim().startsWith('def ')) continue
      if (line.startsWith('    ') || line.startsWith('\t')) {
        const fm = line.match(/^\s+(\w+)\s*(?::\s*([^\n=]+?))?(?:\s*=.*)?$/)
        if (fm && fm[1] && !fm[1].startsWith('__')) {
          fields.push({ name: fm[1], type: fm[2]?.trim() || 'Any' })
        }
      }
    }
    if (fields.length > 0) models.push({ name: className, tableName, file: filePath, fields })
  }
  return models
}
