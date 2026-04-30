import { useEffect, useState, useCallback, createContext, useContext } from 'react'
import axios from 'axios'
import ReactFlow, {
  Background, Controls, BackgroundVariant,
  NodeProps, Handle, Position, useNodesState, useEdgesState,
  MarkerType, Node, Edge,
} from 'reactflow'
import { Loader2, Search, Zap, X, Cpu } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useStore } from '../store/useStore'

// ── Role colors ───────────────────────────────────────────────────────────────
const ROLE_COLOR: Record<string, string> = {
  entrypoint: '#7c3aed', router: '#7c3aed', view: '#7c3aed',
  service:    '#059669', repository: '#059669',
  model:      '#d97706', schema: '#d97706',
  middleware: '#dc2626', dependency: '#ec4899',
  utility:    '#6366f1', module: '#64748b',
}
const rc = (role: string) => ROLE_COLOR[role] ?? '#64748b'

// ── Layout constants ──────────────────────────────────────────────────────────
const D = 68          // circle diameter
const LEVEL_H = 160   // vertical gap between tree levels
const NODE_W = D + 44 // horizontal slot per leaf node
const TREE_GAP = 120  // gap between separate trees

// ── Focus context ─────────────────────────────────────────────────────────────
const FocusCtx = createContext<Set<string>>(new Set())

// ── Types ─────────────────────────────────────────────────────────────────────
interface FlatNode {
  id: string
  data: {
    label: string; qualified_name: string; file_role: string
    relative_path: string; is_async: boolean
    line_start: number | null; line_end: number | null
  }
}

interface RFNode extends Node { data: Record<string, unknown> }

// ── Two-pass tree layout (Reingold-Tilford style) ─────────────────────────────

// Pass 1: compute the minimum subtree width needed for each node
function subtreeWidth(
  nid: string,
  children: Map<string, string[]>,
  seen: Set<string>,
): number {
  const kids = (children.get(nid) ?? []).filter(c => !seen.has(c))
  if (kids.length === 0) return NODE_W
  seen.add(nid)
  const total = kids.reduce((sum, kid) => sum + subtreeWidth(kid, children, new Set(seen)), 0)
  return Math.max(total, NODE_W)
}

// Pass 2: place each node centered over its children
function placeTree(
  nid: string,
  depth: number,
  centerX: number,
  children: Map<string, string[]>,
  placed: Set<string>,
  positions: Map<string, { x: number; y: number }>,
) {
  if (placed.has(nid)) return
  placed.add(nid)
  positions.set(nid, { x: centerX, y: depth * LEVEL_H })

  const kids = (children.get(nid) ?? []).filter(c => !placed.has(c))
  if (kids.length === 0) return

  // Compute width of each child's subtree
  const widths = kids.map(kid => subtreeWidth(kid, children, new Set(placed)))
  const totalW = widths.reduce((a, b) => a + b, 0)

  let x = centerX - totalW / 2
  for (let i = 0; i < kids.length; i++) {
    placeTree(kids[i], depth + 1, x + widths[i] / 2, children, placed, positions)
    x += widths[i]
  }
}

function buildTree(
  flat: FlatNode[],
  rawEdges: { id: string; source: string; target: string; label?: string }[],
): { nodes: RFNode[]; edges: Edge[] } {
  if (!flat.length) return { nodes: [], edges: [] }

  const ids = new Set(flat.map(n => n.id))
  const nodeMap = new Map(flat.map(n => [n.id, n]))

  const validEdges = rawEdges.filter(
    e => ids.has(e.source) && ids.has(e.target) && e.source !== e.target,
  )

  // Directed children + in-degree
  const children = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const n of flat) { children.set(n.id, []); inDegree.set(n.id, 0) }
  for (const e of validEdges) {
    children.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }

  // Connected components (undirected BFS)
  const uAdj = new Map<string, Set<string>>()
  for (const n of flat) uAdj.set(n.id, new Set())
  for (const e of validEdges) {
    uAdj.get(e.source)!.add(e.target)
    uAdj.get(e.target)!.add(e.source)
  }

  const compSeen = new Set<string>()
  const components: string[][] = []
  for (const nid of ids) {
    if (compSeen.has(nid)) continue
    const comp: string[] = []
    const q = [nid]; compSeen.add(nid)
    while (q.length) {
      const cur = q.shift()!; comp.push(cur)
      for (const nb of uAdj.get(cur) ?? []) {
        if (!compSeen.has(nb)) { compSeen.add(nb); q.push(nb) }
      }
    }
    components.push(comp)
  }
  components.sort((a, b) => b.length - a.length)

  const rfNodes: RFNode[] = []
  const rfEdges: Edge[] = []
  let offsetX = 0

  for (const comp of components) {
    const compSet = new Set(comp)

    // Pick root: lowest in-degree, tie-break by most outgoing edges
    const root = comp.slice().sort((a, b) => {
      const d = (inDegree.get(a) ?? 0) - (inDegree.get(b) ?? 0)
      return d !== 0 ? d : (children.get(b)?.length ?? 0) - (children.get(a)?.length ?? 0)
    })[0]

    // Two-pass layout
    const positions = new Map<string, { x: number; y: number }>()
    const placed = new Set<string>()
    const rootW = subtreeWidth(root, children, new Set())
    placeTree(root, 0, rootW / 2, children, placed, positions)

    // Any remaining (isolated in directed sense)
    let orphanX = rootW + NODE_W
    for (const nid of comp) {
      if (!positions.has(nid)) {
        positions.set(nid, { x: orphanX, y: 0 })
        orphanX += NODE_W
      }
    }

    // Emit RF nodes
    for (const [nid, pos] of positions) {
      const fn = nodeMap.get(nid)
      if (!fn) continue
      const color = rc(fn.data.file_role)
      rfNodes.push({
        id: nid,
        type: 'circleNode',
        position: { x: offsetX + pos.x - D / 2, y: pos.y },
        data: { ...fn.data, color },
        style: { width: D, height: D },
      })
    }

    // Emit edges
    for (const e of validEdges) {
      if (compSet.has(e.source) && compSet.has(e.target)) {
        rfEdges.push({
          id: e.id,
          source: e.source, target: e.target,
          type: 'smoothstep', animated: false,
          style: { stroke: '#64748b', strokeWidth: 1.5, strokeOpacity: 0.65 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 12, height: 12 },
        })
      }
    }

    offsetX += rootW + TREE_GAP
  }

  return { nodes: rfNodes, edges: rfEdges }
}

// ── Circle node ───────────────────────────────────────────────────────────────
function CircleNode({ id, data, selected }: NodeProps) {
  const focusedIds = useContext(FocusCtx)
  const isDimmed = focusedIds.size > 0 && !focusedIds.has(id)
  const c = data.color as string
  const isClass = !!data.is_class
  // Classes: rounded square with color fill; functions: plain circle
  const nodeSize = isClass ? D + 8 : D

  return (
    <div style={{
      width: nodeSize, height: nodeSize,
      borderRadius: isClass ? '14px' : '50%',
      background: isClass
        ? selected ? c : `${c}28`
        : selected ? `${c}22` : 'var(--bg-card)',
      border: `2.5px solid ${selected ? c : isClass ? `${c}90` : `${c}70`}`,
      boxShadow: selected
        ? `0 0 0 3px ${c}35, 0 4px 20px rgba(0,0,0,0.35)`
        : `0 2px 10px rgba(0,0,0,0.2)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
      transition: 'opacity 0.18s ease, border-color 0.12s',
      opacity: isDimmed ? 0.1 : 1,
      position: 'relative',
      overflow: 'visible',
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: c, width: 7, height: 7, border: '2px solid var(--bg-card)', top: -4 }} />

      {/* Icon */}
      <div style={{
        width: isClass ? 32 : 28, height: isClass ? 32 : 28,
        borderRadius: isClass ? '8px' : '50%',
        background: isClass ? `rgba(255,255,255,0.15)` : `${c}20`,
        border: `1.5px solid ${isClass ? 'rgba(255,255,255,0.3)' : `${c}50`}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Cpu size={isClass ? 15 : 13} style={{ color: isClass ? '#fff' : c }} />
      </div>

      {/* class / async badge */}
      {isClass && (
        <div style={{
          position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
          fontSize: 7, fontWeight: 800, color: '#fff',
          background: c, padding: '1px 5px', borderRadius: 99, letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
        }}>CLASS</div>
      )}
      {!isClass && !!data.is_async && (
        <div style={{
          position: 'absolute', top: -7, right: -4,
          fontSize: 7, fontWeight: 800, color: '#fff',
          background: c, padding: '1px 4px', borderRadius: 99,
        }}>async</div>
      )}

      {/* Label below node */}
      <div style={{
        position: 'absolute', top: nodeSize + 6,
        left: '50%', transform: 'translateX(-50%)',
        whiteSpace: 'nowrap', fontSize: isClass ? 11 : 10,
        fontWeight: isClass ? 700 : 600,
        color: isDimmed ? 'var(--text-faint)' : 'var(--text)',
        pointerEvents: 'none', maxWidth: 120,
        overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
      }}>
        {data.label as string}
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ background: c, width: 7, height: 7, border: '2px solid var(--bg-card)', bottom: -4 }} />
    </div>
  )
}

const nodeTypes = { circleNode: CircleNode }

// ── Code panel ────────────────────────────────────────────────────────────────
function CodePanel({ data, projectPath, onClose }: {
  data: Record<string, unknown> | null
  projectPath: string
  onClose: () => void
}) {
  const [source, setSource] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!data?.relative_path) { setSource(null); return }
    setLoading(true); setSource(null)
    axios.get('/api/function-source', {
      params: { path: projectPath, file: data.relative_path, line_start: data.line_start, line_end: data.line_end }
    })
      .then(r => setSource(r.data.source))
      .catch(() => setSource('# Could not load source'))
      .finally(() => setLoading(false))
  }, [data, projectPath])

  const c = (data?.color as string) ?? 'var(--accent)'

  if (!data) return null

  return (
    <div style={{
      width: '30%', flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid var(--border)', background: 'var(--bg-card)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)', display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(data.label ?? '')}
            </span>
            {!!data.is_async && (
              <span style={{ fontSize: 9, color: c, background: `${c}20`, padding: '1px 5px', borderRadius: 999, flexShrink: 0 }}>async</span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {String(data.relative_path ?? '')}
            {data.line_start ? `:${data.line_start}` : ''}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border)',
            borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)',
            padding: '4px 6px', display: 'flex', alignItems: 'center', flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--nav-hover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-input)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <X size={13} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: 14 }}>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        )}
        {!loading && source && (
          <SyntaxHighlighter
            language="python"
            style={vscDarkPlus}
            showLineNumbers
            startingLineNumber={(data.line_start as number) || 1}
            customStyle={{ margin: 0, fontSize: 12, lineHeight: 1.65, background: 'transparent', padding: '14px 12px' }}
            lineNumberStyle={{ color: 'var(--text-faint)', minWidth: '2.5em' }}
          >
            {source}
          </SyntaxHighlighter>
        )}
        {!loading && !source && (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--text-muted)' }}>No source available.</div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CallGraph() {
  const { projectPath } = useStore()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [selectedData, setSelectedData] = useState<Record<string, unknown> | null>(null)
  const [focusedIds, setFocusedIds] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState({ funcs: 0, edges: 0 })

  const load = useCallback(async (fn?: string) => {
    setLoading(true); setSelectedData(null); setFocusedIds(new Set())
    try {
      const params: Record<string, string> = { path: projectPath }
      if (fn) params.function_name = fn
      const { data } = await axios.get('/api/call-graph', { params })
      const flatNodes: FlatNode[] = data.nodes || []
      const flatEdges = (data.edges || []) as { id: string; source: string; target: string; label?: string }[]
      const { nodes: n, edges: e } = buildTree(flatNodes, flatEdges)
      setStats({ funcs: flatNodes.length, edges: flatEdges.length })
      setNodes(n); setEdges(e)
    } finally {
      setLoading(false); setSearching(false)
    }
  }, [projectPath, setNodes, setEdges])

  useEffect(() => { load() }, [load])

  const handleSearch = (ev: React.FormEvent) => {
    ev.preventDefault(); setSearching(true)
    load(search.trim() || undefined)
  }

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== 'circleNode') return
    const d = node.data as Record<string, unknown>
    setSelectedData(d)

    const connected = new Set<string>([node.id])
    setEdges(eds => {
      eds.forEach(e => {
        if (e.source === node.id) connected.add(e.target)
        if (e.target === node.id) connected.add(e.source)
      })
      return eds.map(e => {
        const active = e.source === node.id || e.target === node.id
        const col = active ? (d.color as string) : '#64748b'
        return {
          ...e, animated: active,
          style: { stroke: col, strokeWidth: active ? 2 : 1.5, strokeOpacity: active ? 1 : 0.15 },
          markerEnd: { type: MarkerType.ArrowClosed, color: col, width: 12, height: 12 },
        }
      })
    })
    setFocusedIds(new Set(connected))
  }, [setEdges])

  const resetFocus = useCallback(() => {
    setSelectedData(null); setFocusedIds(new Set())
    setEdges(eds => eds.map(e => ({
      ...e, animated: false,
      style: { stroke: '#64748b', strokeWidth: 1.5, strokeOpacity: 0.6 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 12, height: 12 },
    })))
  }, [setEdges])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8 }}>
      <Loader2 size={18} className="animate-spin" />
      <span style={{ fontSize: 13 }}>Building call graph…</span>
    </div>
  )

  return (
    <FocusCtx.Provider value={focusedIds}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px 8px 96px', flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
        }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '5px 10px',
            }}>
              <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12, width: 190 }}
                placeholder="Filter by function name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button type="submit" disabled={searching} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--btn-bg)',
              color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
            }}>
              {searching ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
              {search ? 'Subgraph' : 'Full graph'}
            </button>
            {search && (
              <button type="button" onClick={() => { setSearch(''); load() }} style={{
                padding: '5px 10px', borderRadius: 8, border: 'none',
                background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
              }}>
                Reset
              </button>
            )}
          </form>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {focusedIds.size > 0 && (
              <button onClick={resetFocus} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px',
                borderRadius: 6, border: '1px solid var(--border)', background: 'var(--btn-bg)',
                color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
              }}>
                <X size={10} /> Clear focus
              </button>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {stats.funcs} functions · {stats.edges} edges
            </span>
          </div>
        </div>

        {/* Canvas + Code panel */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              onNodeClick={handleNodeClick}
              onPaneClick={resetFocus}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              minZoom={0.04}
              maxZoom={2.5}
              attributionPosition="bottom-left"
            >
              <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={22} size={1} />
              <Controls style={{ bottom: 16, left: 16, top: 'auto' }} />

              {!selectedData && stats.funcs > 0 && (
                <div style={{
                  position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 20, background: 'var(--bg-panel)', border: '1px solid var(--border)',
                  backdropFilter: 'blur(8px)', borderRadius: 8, padding: '5px 14px',
                  fontSize: 11, color: 'var(--text-muted)', pointerEvents: 'none',
                }}>
                  Click any node to view source · Click canvas to clear focus
                </div>
              )}
            </ReactFlow>
          </div>

          <CodePanel data={selectedData} projectPath={projectPath} onClose={resetFocus} />
        </div>
      </div>
    </FocusCtx.Provider>
  )
}
