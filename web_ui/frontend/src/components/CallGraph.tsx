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

// ── Theme-aware colors ────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  entrypoint: '#7c3aed', router: '#7c3aed', view: '#7c3aed',
  service:    '#059669', repository: '#059669',
  model:      '#d97706', schema: '#d97706',
  middleware: '#dc2626', dependency: '#ec4899',
  utility:    '#6366f1', module: '#64748b',
}
const rc = (role: string) => ROLE_COLOR[role] ?? '#64748b'

// ── Layout constants ──────────────────────────────────────────────────────────

const CW = 210      // chip width
const CH = 40       // chip height
const CGY = 12      // chip gap vertical
const LGX = 50      // gap between layers (between chip right-edge and next left-edge)
const LSX = CW + LGX // layer step x = 260
const LBL_H = 30    // cluster label height
const CPX = 22      // cluster padding x
const CPY = 14      // cluster padding y
const CLGX = 80     // gap between clusters x
const CLGY = 60     // gap between clusters y

// ── Focus context (uses React Flow node id, not data.id) ─────────────────────

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

// ── Cluster layout builder ────────────────────────────────────────────────────

function buildClusters(flat: FlatNode[], rawEdges: Record<string, unknown>[]): { nodes: RFNode[]; edges: Edge[] } {
  if (!flat.length) return { nodes: [], edges: [] }

  const nodeMap = new Map(flat.map(n => [n.id, n]))
  const ids = new Set(flat.map(n => n.id))

  // Valid edges (both endpoints exist, no self-loops)
  const validEdges = (rawEdges as { id: string; source: string; target: string; label?: string }[])
    .filter(e => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)

  // Undirected adjacency for connected-components
  const uadj = new Map<string, Set<string>>()
  for (const n of flat) uadj.set(n.id, new Set())
  for (const e of validEdges) {
    uadj.get(e.source)?.add(e.target)
    uadj.get(e.target)?.add(e.source)
  }

  // Directed adjacency for layering
  const dadj = new Map<string, Set<string>>()
  const inDeg = new Map<string, number>()
  for (const n of flat) { dadj.set(n.id, new Set()); inDeg.set(n.id, 0) }
  for (const e of validEdges) {
    dadj.get(e.source)?.add(e.target)
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1)
  }

  // Find connected components (BFS undirected)
  const visited = new Set<string>()
  const components: string[][] = []
  for (const nid of ids) {
    if (visited.has(nid)) continue
    const comp: string[] = []
    const q = [nid]; visited.add(nid)
    while (q.length) {
      const cur = q.shift()!; comp.push(cur)
      for (const nb of uadj.get(cur) ?? []) {
        if (!visited.has(nb)) { visited.add(nb); q.push(nb) }
      }
    }
    components.push(comp)
  }
  components.sort((a, b) => b.length - a.length)

  // Compute layers within each component (directed BFS → topological layers)
  interface ClusterInfo {
    comp: string[]; compSet: Set<string>
    layers: string[][]
    w: number; h: number
  }

  const clInfos: ClusterInfo[] = components.map(comp => {
    const compSet = new Set(comp)
    const localIn = new Map(comp.map(n => [n, 0]))
    for (const e of validEdges) {
      if (compSet.has(e.source) && compSet.has(e.target))
        localIn.set(e.target, (localIn.get(e.target) ?? 0) + 1)
    }

    const layers: string[][] = []
    const placed = new Set<string>()
    let frontier = comp.filter(n => localIn.get(n) === 0)
    if (!frontier.length) frontier = [comp[0]]

    while (frontier.length) {
      layers.push(frontier)
      frontier.forEach(n => placed.add(n))
      const next: string[] = []
      for (const n of frontier) {
        for (const nb of dadj.get(n) ?? []) {
          if (compSet.has(nb) && !placed.has(nb) && !next.includes(nb)) next.push(nb)
        }
      }
      frontier = next
    }
    // Remaining (cycles)
    const remaining = comp.filter(n => !placed.has(n))
    if (remaining.length) layers.push(remaining)

    const nL = layers.length
    const maxRow = Math.max(...layers.map(l => l.length))
    const w = 2 * CPX + nL * CW + (nL - 1) * LGX
    const h = LBL_H + CPY + maxRow * CH + Math.max(0, maxRow - 1) * CGY + CPY
    return { comp, compSet, layers, w, h }
  })

  // Place clusters: bin-pack into 3 columns (shortest column first)
  const N_COLS = Math.min(3, clInfos.length)
  const colY = Array(N_COLS).fill(0)
  const maxW = Math.max(...clInfos.map(c => c.w), 300)
  const colStep = maxW + CLGX

  const rfNodes: RFNode[] = []
  const rfEdges: Edge[] = []

  for (let ci = 0; ci < clInfos.length; ci++) {
    const { comp, compSet, layers, w, h } = clInfos[ci]

    // Pick column with minimum Y
    const col = colY.indexOf(Math.min(...colY))
    const clx = col * colStep
    const cly = colY[col]
    colY[col] += h + CLGY

    // Dominant role for cluster color
    const roleCnt = new Map<string, number>()
    for (const nid of comp) {
      const r = nodeMap.get(nid)?.data.file_role ?? 'module'
      roleCnt.set(r, (roleCnt.get(r) ?? 0) + 1)
    }
    const topRole = [...roleCnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'module'
    const clColor = rc(topRole)
    const clLabel = comp.length === 1
      ? (nodeMap.get(comp[0])?.data.relative_path?.split('/').pop() ?? 'module')
      : `${comp.length} functions · ${nodeMap.get(comp[0])?.data.relative_path?.split('/').pop() ?? ''}`

    // Background cluster node
    rfNodes.push({
      id: `cl__${ci}`,
      type: 'clusterNode',
      position: { x: clx, y: cly },
      data: { label: clLabel, color: clColor },
      style: { width: w, height: h, zIndex: -2, pointerEvents: 'none' },
      selectable: false,
      focusable: false,
    } as RFNode)

    // Chip nodes
    const maxRow = Math.max(...layers.map(l => l.length))
    const maxChipH = maxRow * CH + Math.max(0, maxRow - 1) * CGY

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li]
      const lx = clx + CPX + li * LSX
      const layerChipH = layer.length * CH + Math.max(0, layer.length - 1) * CGY
      const startY = cly + LBL_H + CPY + (maxChipH - layerChipH) / 2

      for (let ni = 0; ni < layer.length; ni++) {
        const nid = layer[ni]
        const fn = nodeMap.get(nid)
        if (!fn) continue
        const color = rc(fn.data.file_role)
        rfNodes.push({
          id: nid,
          type: 'chipNode',
          position: { x: lx, y: startY + ni * (CH + CGY) },
          data: { ...fn.data, color, nodeId: nid, execOrder: li + 1 },
          style: { width: CW, height: CH, zIndex: 10 },
        })
      }
    }

    // Edges within component
    for (const e of validEdges) {
      if (compSet.has(e.source) && compSet.has(e.target)) {
        rfEdges.push({
          id: e.id,
          source: e.source, target: e.target,
          type: 'smoothstep', animated: false,
          style: { stroke: '#64748b', strokeWidth: 1.5, strokeOpacity: 0.55 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 12, height: 12 },
        })
      }
    }
  }

  return { nodes: rfNodes, edges: rfEdges }
}

// ── Cluster background node ───────────────────────────────────────────────────

function ClusterNode({ data }: NodeProps) {
  const c = data.color as string
  return (
    <div style={{
      width: '100%', height: '100%',
      background: `${c}18`,
      border: `1.5px solid ${c}55`,
      borderRadius: 14,
      pointerEvents: 'none',
    }}>
      <div style={{
        padding: '6px 14px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
        color: c,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        borderBottom: `1px solid ${c}35`,
      }}>
        {data.label as string}
      </div>
    </div>
  )
}

// ── Chip node (pill-shaped function) ─────────────────────────────────────────

function ChipNode({ id, data, selected }: NodeProps) {
  const focusedIds = useContext(FocusCtx)
  const isDimmed = focusedIds.size > 0 && !focusedIds.has(id)
  const c = data.color as string

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '4px 10px 4px 5px',
      background: selected ? `${c}18` : 'var(--bg-card)',
      border: `1.5px solid ${selected ? c : `${c}40`}`,
      borderRadius: 999,
      boxShadow: selected
        ? `0 0 0 2px ${c}28, 0 2px 10px rgba(0,0,0,0.25)`
        : '0 1px 3px rgba(0,0,0,0.12)',
      cursor: 'pointer',
      transition: 'opacity 0.18s ease, border-color 0.12s',
      opacity: isDimmed ? 0.15 : 1,
    }}>
      <Handle type="target" position={Position.Left}
        style={{ background: c, width: 6, height: 6, border: '2px solid var(--bg-card)', left: -4 }} />

      {/* Execution order badge */}
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: c, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0,
      }}>
        {data.execOrder as number}
      </div>

      {/* Icon bubble */}
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: `${c}15`, border: `1.5px solid ${c}35`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Cpu size={10} style={{ color: c }} />
      </div>

      <span style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
      }}>
        {data.label as string}
      </span>

      {!!data.is_async && (
        <span style={{
          fontSize: 8, fontWeight: 700, color: c,
          background: `${c}15`, padding: '1px 5px',
          borderRadius: 999, flexShrink: 0, letterSpacing: '0.04em',
        }}>async</span>
      )}

      <Handle type="source" position={Position.Right}
        style={{ background: c, width: 6, height: 6, border: '2px solid var(--bg-card)', right: -4 }} />
    </div>
  )
}

const nodeTypes = { clusterNode: ClusterNode, chipNode: ChipNode }

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
      {/* Header */}
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
              <span style={{ fontSize: 9, color: c, background: `${c}20`, padding: '1px 5px', borderRadius: 999, flexShrink: 0 }}>
                async
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {String(data.relative_path ?? '')}
            {data.line_start ? `:${data.line_start}` : ''}
          </div>
        </div>
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border)',
            borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)',
            padding: '4px 6px', display: 'flex', alignItems: 'center', flexShrink: 0,
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--nav-hover)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-input)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Source */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: '14px' }}>
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
          <div style={{ padding: '14px', fontSize: 12, color: 'var(--text-muted)' }}>
            No source available.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

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
      const flatEdges: Record<string, unknown>[] = data.edges || []
      const { nodes: n, edges: e } = buildClusters(flatNodes, flatEdges)
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
    if (node.type !== 'chipNode') return
    const d = node.data as Record<string, unknown>
    setSelectedData(d)

    // Find 1-hop neighbours using current edges ref
    const connected = new Set<string>([node.id])
    setEdges(eds => {
      eds.forEach(e => {
        if (e.source === node.id) connected.add(e.target)
        if (e.target === node.id) connected.add(e.source)
      })
      // Highlight active edges
      return eds.map(e => {
        const active = e.source === node.id || e.target === node.id
        const col = active ? (d.color as string) : '#64748b'
        return {
          ...e, animated: active,
          style: { stroke: col, strokeWidth: active ? 2 : 1.5, strokeOpacity: active ? 1 : 0.2 },
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
      style: { stroke: '#64748b', strokeWidth: 1.5, strokeOpacity: 0.55 },
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

        {/* ── Toolbar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px 8px 96px', flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
        }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Search */}
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
            {/* Action button — same visual level as search */}
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

          {/* Right side stats / focus clear */}
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

        {/* ── Canvas + Code panel ── */}
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
              fitViewOptions={{ padding: 0.1 }}
              minZoom={0.04}
              maxZoom={2.5}
              attributionPosition="bottom-left"
            >
              <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={22} size={1} />
              <Controls style={{ bottom: 16, left: 16, top: 'auto' }} />

              {/* Hint */}
              {!selectedData && stats.funcs > 0 && (
                <div style={{
                  position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 20, background: 'var(--bg-panel)', border: '1px solid var(--border)',
                  backdropFilter: 'blur(8px)', borderRadius: 8, padding: '5px 14px',
                  fontSize: 11, color: 'var(--text-muted)', pointerEvents: 'none',
                }}>
                  Click any function chip to view source · Click canvas to clear focus
                </div>
              )}
            </ReactFlow>
          </div>

          {/* Code panel */}
          <CodePanel data={selectedData} projectPath={projectPath} onClose={resetFocus} />
        </div>
      </div>
    </FocusCtx.Provider>
  )
}
