import { inferRole } from './roles.js'
import path from 'path'
import fs from 'fs'

export interface FunctionInfo {
  name: string
  qualifiedName: string
  lineStart: number
  lineEnd: number
  isAsync: boolean
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

export interface ModelField {
  name: string
  type: string
}

export interface ModelInfo {
  name: string
  tableName: string
  file: string
  fields: ModelField[]
}

export interface FileInfo {
  path: string
  relativePath: string
  fileRole: string
  functions: FunctionInfo[]
  routes: RouteInfo[]
  models: ModelInfo[]
}

export function parseFile(filePath: string, projectRoot: string): FileInfo | null {
  let source: string
  try {
    source = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }

  const relativePath = path.relative(projectRoot, filePath)
  const fileRole = inferRole(filePath)
  const moduleName = path.basename(filePath, '.py')

  const functions = extractFunctions(source, moduleName)
  const routes = extractRoutes(source)
  const models = extractModels(source, filePath)

  return { path: filePath, relativePath, fileRole, functions, routes, models }
}

function extractFunctions(source: string, moduleName: string): FunctionInfo[] {
  const lines = source.split('\n')
  const functions: FunctionInfo[] = []

  const fnHeaderRe = /^( *)(async )?def (\w+)\(([^)]*(?:\([^)]*\)[^)]*)*)\)(?:\s*->\s*([^:]+))?:/
  const decoratorRe = /^( *)@(.+)/
  const docstringRe = /^\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const match = line.match(fnHeaderRe)
    if (match) {
      const indent = match[1].length
      const isAsync = !!match[2]
      const name = match[3]
      const paramsStr = match[4]
      const returnType = match[5]?.trim() || null
      const lineStart = i + 1

      // Collect decorators above
      const decorators: string[] = []
      let dIdx = i - 1
      while (dIdx >= 0) {
        const dm = lines[dIdx].match(decoratorRe)
        if (dm && dm[1].length === indent) {
          decorators.unshift('@' + dm[2].trim())
          dIdx--
        } else break
      }

      // Parse parameters
      const parameters = paramsStr
        .split(',')
        .map(p => p.trim().split(':')[0].split('=')[0].trim())
        .filter(p => p && p !== 'self' && p !== 'cls' && !p.startsWith('*'))

      // Find function body end (next line at same or lower indent level, not blank)
      let lineEnd = lineStart
      let j = i + 1
      while (j < lines.length) {
        const bodyLine = lines[j]
        if (bodyLine.trim() === '') { j++; continue }
        const bodyIndent = bodyLine.match(/^( *)/)?.[1].length ?? 0
        if (bodyIndent <= indent) break
        lineEnd = j + 1
        j++
      }

      // Extract docstring
      let docstring: string | null = null
      const bodyStart = i + 1
      if (bodyStart < lines.length) {
        const bodySlice = lines.slice(bodyStart, Math.min(bodyStart + 5, lines.length)).join('\n')
        const docMatch = bodySlice.match(/^\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/)
        if (docMatch) docstring = (docMatch[1] || docMatch[2]).trim()
      }

      // Extract calls within this function body
      const bodyLines = lines.slice(i + 1, lineEnd)
      const calls = extractCalls(bodyLines, i + 1)

      functions.push({
        name,
        qualifiedName: `${moduleName}.${name}`,
        lineStart,
        lineEnd,
        isAsync,
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

  return functions
}

function extractCalls(bodyLines: string[], baseLineNum: number): Array<{ calleeName: string; line: number }> {
  const calls: Array<{ calleeName: string; line: number }> = []
  // Match function calls: word( or word.word(
  const callRe = /\b((?:\w+\.)*\w+)\s*\(/g

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]
    let m: RegExpExecArray | null
    while ((m = callRe.exec(line)) !== null) {
      const name = m[1]
      // Skip built-ins and keywords
      if (['if', 'while', 'for', 'with', 'assert', 'print', 'len', 'str', 'int', 'list', 'dict', 'set', 'tuple', 'range', 'type', 'isinstance', 'super'].includes(name)) continue
      calls.push({ calleeName: name, line: baseLineNum + i })
    }
    callRe.lastIndex = 0
  }
  return calls
}

function extractRoutes(source: string): RouteInfo[] {
  const routes: RouteInfo[] = []
  // Match @router.get("/path") or @app.post("/path") style decorators
  const routeRe = /@(?:app|router|blueprint)\.(get|post|put|patch|delete|head|options)\s*\(\s*["']([^"']+)["']([^)]*)\)/gi
  const funcRe = /\ndef\s+(\w+)\s*\(/

  let m: RegExpExecArray | null
  while ((m = routeRe.exec(source)) !== null) {
    const method = m[1].toUpperCase()
    const routePath = m[2]
    const rest = m[3] || ''

    // Find handler function after this decorator
    const afterDecorator = source.slice(m.index + m[0].length)
    const fnMatch = afterDecorator.match(funcRe)
    const handler = fnMatch?.[1] || 'unknown'

    // Extract tags
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
  // Match class definitions that extend ORM base classes
  const classRe = /^class\s+(\w+)\s*\(([^)]*)\)\s*:/gm
  const fieldRe = /^\s+(\w+)\s*(?::\s*([^\n=]+?))?(?:\s*=\s*.+)?$/gm
  const tableNameRe = /__tablename__\s*=\s*["']([^"']+)["']/

  let m: RegExpExecArray | null
  while ((m = classRe.exec(source)) !== null) {
    const className = m[1]
    const bases = m[2]

    const isModel = /Base|SQLModel|DeclarativeBase|Model/.test(bases)
    if (!isModel) continue

    // Extract body of this class
    const bodyStart = m.index + m[0].length
    const nextClassMatch = source.slice(bodyStart).match(/\nclass\s+/)
    const bodyEnd = nextClassMatch ? bodyStart + nextClassMatch.index! : source.length
    const body = source.slice(bodyStart, bodyEnd)

    const tableNameMatch = body.match(tableNameRe)
    const tableName = tableNameMatch ? tableNameMatch[1] : className.toLowerCase() + 's'

    const fields: ModelField[] = []
    const bodyLines = body.split('\n').slice(1)
    for (const line of bodyLines) {
      if (line.trim() === '' || line.trim().startsWith('#') || line.trim().startsWith('def ')) continue
      if (line.startsWith('    ') || line.startsWith('\t')) {
        const fm = line.match(/^\s+(\w+)\s*(?::\s*([^\n=]+?))?(?:\s*=.*)?$/)
        if (fm && fm[1] && !fm[1].startsWith('__')) {
          fields.push({ name: fm[1], type: fm[2]?.trim() || 'Any' })
        }
      }
    }

    if (fields.length > 0) {
      models.push({ name: className, tableName, file: filePath, fields })
    }
  }
  return models
}
