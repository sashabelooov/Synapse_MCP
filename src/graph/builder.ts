import { DatabaseSync } from 'node:sqlite'

const ROLE_COLORS: Record<string, string> = {
  entrypoint: '#6366f1',
  router:     '#8b5cf6',
  view:       '#8b5cf6',
  service:    '#06b6d4',
  repository: '#10b981',
  model:      '#f59e0b',
  schema:     '#f97316',
  dependency: '#ec4899',
  utility:    '#64748b',
  config:     '#64748b',
  test:       '#94a3b8',
  module:     '#475569',
}

const COL_WIDTH = 280
const ROW_HEIGHT = 120

export function buildCallGraph(functions: any[], calls: any[]): { nodes: any[]; edges: any[] } {
  const idToFunc = new Map(functions.map(f => [f.id, f]))
  const adjacency = new Map<number, Set<number>>()

  for (const fn of functions) adjacency.set(fn.id, new Set())
  for (const call of calls) {
    if (call.callee_id) {
      adjacency.get(call.caller_id)?.add(call.callee_id)
    }
  }

  // Topological sort (Kahn's algorithm)
  const inDegree = new Map<number, number>()
  for (const fn of functions) inDegree.set(fn.id, 0)
  for (const [src, targets] of adjacency) {
    for (const tgt of targets) {
      inDegree.set(tgt, (inDegree.get(tgt) ?? 0) + 1)
    }
  }

  const queue: number[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const ordered: number[] = []
  while (queue.length > 0) {
    const n = queue.shift()!
    ordered.push(n)
    for (const neighbor of adjacency.get(n) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  // Add any nodes not in topo sort (cycles)
  const inOrdered = new Set(ordered)
  for (const fn of functions) {
    if (!inOrdered.has(fn.id)) ordered.push(fn.id)
  }

  const layerMap = new Map(ordered.map((id, i) => [id, i]))

  const nodes: any[] = []
  const edges: any[] = []

  for (const nid of ordered) {
    const func = idToFunc.get(nid)
    if (!func) continue
    const col = layerMap.get(nid)! % 5
    const row = Math.floor(layerMap.get(nid)! / 5)
    const color = ROLE_COLORS[func.file_role as string] ?? '#475569'
    nodes.push({
      id: String(nid),
      type: 'custom',
      position: { x: col * COL_WIDTH, y: row * ROW_HEIGHT },
      data: {
        label: func.name,
        is_class: !!func.is_class,
        qualified_name: func.qualified_name,
        file_role: func.file_role,
        relative_path: func.relative_path ?? '',
        is_async: !!func.is_async,
        color,
        line_start: func.line_start,
        line_end: func.line_end,
      },
    })
  }

  for (const call of calls) {
    if (!call.callee_id) continue
    edges.push({
      id: `e${call.caller_id}-${call.callee_id}`,
      source: String(call.caller_id),
      target: String(call.callee_id),
      label: call.callee_name,
      animated: false,
      style: { stroke: '#475569' },
    })
  }

  return { nodes, edges }
}

export function buildDbGraph(models: any[]): { nodes: any[]; edges: any[] } {
  const nodes: any[] = []
  const edges: any[] = []

  models.forEach((model, i) => {
    const col = i % 4
    const row = Math.floor(i / 4)
    const fields = typeof model.fields === 'string' ? JSON.parse(model.fields) : model.fields
    nodes.push({
      id: `model-${model.id}`,
      type: 'dbModel',
      position: { x: col * 320, y: row * 250 },
      data: { name: model.name, table_name: model.table_name, fields },
    })
  })

  return { nodes, edges }
}

export function getReachableIds(db: DatabaseSync, startId: number, maxDepth: number): Set<number> {
  const visited = new Set<number>([startId])
  let frontier = new Set<number>([startId])

  for (let d = 0; d < maxDepth; d++) {
    if (frontier.size === 0) break
    const placeholders = Array.from(frontier).map(() => '?').join(',')
    const rows = db.prepare(
      `SELECT callee_id FROM calls WHERE caller_id IN (${placeholders}) AND callee_id IS NOT NULL`
    ).all(...frontier) as { callee_id: number }[]

    const next = new Set<number>()
    for (const r of rows) {
      if (!visited.has(r.callee_id)) {
        visited.add(r.callee_id)
        next.add(r.callee_id)
      }
    }
    frontier = next
  }

  return visited
}
