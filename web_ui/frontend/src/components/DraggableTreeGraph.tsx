import { useCallback, useEffect, useRef, useState } from 'react'

interface TreeNode {
  name: string; type: 'file' | 'dir'; path: string; children?: TreeNode[]
}
interface GraphNode {
  id: string; label: string; type: 'file' | 'dir'; role: string; x: number; y: number
}
interface GraphEdge { source: string; target: string }

const ROLE_COLOR: Record<string, string> = {
  model: '#f59e0b', schema: '#f97316', router: '#8b5cf6', view: '#8b5cf6',
  service: '#06b6d4', repository: '#10b981', entrypoint: '#6366f1',
  dependency: '#ec4899', middleware: '#ef4444', config: '#64748b',
  utility: '#94a3b8', admin: '#a78bfa', signal: '#34d399', task: '#fbbf24',
}

function inferRole(name: string): string {
  const n = name.replace('.py', '').toLowerCase()
  const map: Record<string, string> = {
    models: 'model', model: 'model', schemas: 'schema', schema: 'schema',
    serializers: 'schema', views: 'view', routes: 'router', router: 'router',
    routers: 'router', services: 'service', service: 'service',
    repository: 'repository', dependencies: 'dependency', deps: 'dependency',
    main: 'entrypoint', app: 'entrypoint', urls: 'router', admin: 'admin',
    middleware: 'middleware', config: 'config', settings: 'config',
    utils: 'utility', helpers: 'utility', tasks: 'task',
  }
  return map[n] || ''
}

const NODE_W = 90, NODE_H = 62, H_GAP = 60, V_GAP = 40

function subtreeSize(n: TreeNode): number {
  if (!n.children?.length) return 1
  return n.children.reduce((s, c) => s + subtreeSize(c), 0)
}

function buildGraph(root: TreeNode, direction: 'TB' | 'LR') {
  const nodes: GraphNode[] = [], edges: GraphEdge[] = []
  const SW = NODE_W + H_GAP, SH = NODE_H + V_GAP

  function place(n: TreeNode, depth: number, leafOff: number) {
    const size = subtreeSize(n)
    const center = leafOff + size / 2 - 0.5
    nodes.push({
      id: n.path, label: n.name, type: n.type,
      role: n.type === 'file' ? inferRole(n.name) : '',
      x: direction === 'TB' ? center * SW : depth * SW,
      y: direction === 'TB' ? depth * SH : center * SH,
    })
    if (n.children?.length) {
      let off = leafOff
      for (const c of n.children) {
        edges.push({ source: n.path, target: c.path })
        place(c, depth + 1, off)
        off += subtreeSize(c)
      }
    }
  }
  place(root, 0, 0)
  return { nodes, edges }
}

function toSVGPoint(svg: SVGSVGElement, cx: number, cy: number) {
  const pt = svg.createSVGPoint()
  pt.x = cx; pt.y = cy
  return pt.matrixTransform(svg.getScreenCTM()!.inverse())
}

// ── Branded SVG icons (nested <svg> auto-scales via viewBox) ─────────────────

function PythonIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width={22} height={22} viewBox="0 0 110 110">
      <path d="M55 0C24.4 0 25.6 13.2 25.6 13.2l.1 13.6h29.5v4.2H14.4S0 29.1 0 55.4s13.5 25.4 13.5 25.4l12.1-.1V64.3c0-16.1 13.1-30.1 30.1-30.1h28.1V13.2S85.6 0 55 0z" fill="#3776ab"/>
      <path d="M55 110c30.6 0 29.4-13.2 29.4-13.2l-.1-13.6H54.8v-4.2h40.8s14.4 1.9 14.4-24.4-13.5-25.4-13.5-25.4l-12.1.1v16.4c0 16.1-13.1 30.1-30.1 30.1H26.2v21.1s-1.8 13.2 28.8 13.2z" fill="#ffd343"/>
    </svg>
  )
}

function PostgresIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width={22} height={22} viewBox="0 0 100 100">
      <path d="M37.5 15.6c-11.8 0-21.4 9.6-21.4 21.4v2.7c0 3.3.6 6.5 1.7 9.5l-4.2 3.6c-2.4 2-3.8 4.9-3.8 8v1.7h37.5c2.3 0 4.2-1.9 4.2-4.2v-32c0-5.9-4.8-10.7-10.7-10.7h-3.3zm25 0c-5.9 0-10.7 4.8-10.7 10.7v32c0 2.3 1.9 4.2 4.2 4.2h37.5v-1.7c0-3.1-1.4-6-3.8-8l-4.2-3.6c1.1-3 1.7-6.2 1.7-9.5v-2.7c0-11.8-9.6-21.4-21.4-21.4h-3.3z" fill="#336791"/>
    </svg>
  )
}

function DockerIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width={22} height={22} viewBox="0 0 24 24">
      <path d="M13.983 11.078h2.119c.102 0 .186-.084.186-.186V8.773a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.186v2.119c0 .102.083.186.185.186m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.342a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v2.119c0 .102.084.186.185.186m0 2.715h2.118a.187.187 0 00.186-.186V6.058a.187.187 0 00-.186-.186h-2.118a.185.185 0 00-.185.186v2.119c0 .102.084.186.185.186m-2.954 0h2.119a.186.186 0 00.185-.186V6.058a.185.185 0 00-.185-.186H8.075a.186.186 0 00-.185.186v2.119c0 .102.083.186.185.186m0 2.715h2.119a.186.186 0 00.185-.186V8.773a.186.186 0 00-.185-.186H8.075a.186.186 0 00-.185.186v2.119c0 .102.083.186.185.186m-2.954 0h2.119a.186.186 0 00.185-.186V8.773a.186.186 0 00-.185-.186H5.12a.186.186 0 00-.185.186v2.119c0 .102.084.186.185.186m-2.954 0h2.119a.186.186 0 00.185-.186V8.773a.186.186 0 00-.185-.186H2.166a.186.186 0 00-.185.186v2.119c0 .102.084.186.185.186m0-2.715h2.119a.186.186 0 00.185-.186V6.058a.185.185 0 00-.185-.186H2.166a.186.186 0 00-.185.186v2.119c0 .102.084.186.185.186m0-2.715h2.119a.186.186 0 00.185-.186V3.342a.186.186 0 00-.185-.185H2.166a.186.186 0 00-.185.185v2.119c0 .102.084.186.185.186m20.93 5.99c-1.17-.444-2.486-.25-4.174.405-1.772.71-3.228.87-4.596.102C15.744 10.439 14.557 9.621 13.983 8.3c-.812 1.275-1.147 1.367-1.906 1.367H.83c-.18 0-.312.149-.33.323-.306 2.912.239 5.152 1.613 6.653 3.56 3.886 10.016 3.648 13.08 1.453 1.114-.797 1.997-1.891 2.591-3.234 1.384 1.264 3.317 1.496 5.355.74 1.027-.381 1.786-1.023 2.491-1.892a.25.25 0 00-.303-.37" fill="#2496ed"/>
    </svg>
  )
}

function GitHubIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width={22} height={22} viewBox="0 0 24 24">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" fill="#94a3b8"/>
    </svg>
  )
}

function FolderIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <svg x={x} y={y} width={22} height={22} viewBox="0 0 24 24">
      <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" fill={color}/>
    </svg>
  )
}

function GenericFileIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <svg x={x} y={y} width={22} height={22} viewBox="0 0 24 24">
      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" fill={color} opacity="0.85"/>
    </svg>
  )
}

function NodeIcon({ x, y, name, type, roleColor }: {
  x: number; y: number; name: string; type: 'file' | 'dir'; roleColor: string
}) {
  const n = name.toLowerCase()
  if (type === 'dir') {
    if (n === 'docker' || n.startsWith('docker')) return <DockerIcon x={x} y={y} />
    if (n === '.github' || n === 'github') return <GitHubIcon x={x} y={y} />
    return <FolderIcon x={x} y={y} color="#facc15" />
  }
  if (n.endsWith('.py')) return <PythonIcon x={x} y={y} />
  if (n.startsWith('dockerfile') || n.includes('docker')) return <DockerIcon x={x} y={y} />
  if (n.includes('postgres') || n.includes('postgresql') || n.endsWith('.sql')) return <PostgresIcon x={x} y={y} />
  if (n.includes('github') || n === '.gitignore' || n === '.gitattributes') return <GitHubIcon x={x} y={y} />
  return <GenericFileIcon x={x} y={y} color={roleColor} />
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props { root: TreeNode; direction: 'TB' | 'LR' }

export default function DraggableTreeGraph({ root, direction }: Props) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [baseNodes, setBaseNodes] = useState<GraphNode[]>([])
  const [viewBox, setViewBox] = useState({ x: -50, y: -50, w: 1200, h: 800 })

  const dragging = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const panning  = useRef<{ sx: number; sy: number; vbx: number; vby: number } | null>(null)
  const viewBoxRef = useRef(viewBox)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => { viewBoxRef.current = viewBox }, [viewBox])

  useEffect(() => {
    const { nodes, edges: e } = buildGraph(root, direction)
    setBaseNodes(nodes)
    setEdges(e)
    const pos: Record<string, { x: number; y: number }> = {}
    nodes.forEach(n => { pos[n.id] = { x: n.x, y: n.y } })
    setPositions(pos)
    if (nodes.length) {
      const maxX = Math.max(...nodes.map(n => n.x + NODE_W))
      const maxY = Math.max(...nodes.map(n => n.y + NODE_H))
      setViewBox({ x: -50, y: -50, w: maxX + 100, h: maxY + 100 })
    }
  }, [root, direction])

  // Wheel zoom (non-passive so preventDefault works)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handle = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
      setViewBox(prev => {
        const vbmx = prev.x + (mx / rect.width) * prev.w
        const vbmy = prev.y + (my / rect.height) * prev.h
        const nw = Math.max(120, Math.min(8000, prev.w * factor))
        const nh = Math.max(80,  Math.min(6000, prev.h * factor))
        return { x: vbmx - (mx / rect.width) * nw, y: vbmy - (my / rect.height) * nh, w: nw, h: nh }
      })
    }
    el.addEventListener('wheel', handle, { passive: false })
    return () => el.removeEventListener('wheel', handle)
  }, [])

  // Node drag start — stopPropagation prevents canvas pan from starting
  const onNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    const pt = toSVGPoint(svgRef.current!, e.clientX, e.clientY)
    const pos = positions[id] ?? { x: 0, y: 0 }
    dragging.current = { id, ox: pt.x - pos.x, oy: pt.y - pos.y }
    if (svgRef.current) svgRef.current.style.cursor = 'grabbing'
  }, [positions])

  // Canvas pan start (fires only when clicking empty SVG, nodes stop propagation)
  const onSVGMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    panning.current = { sx: e.clientX, sy: e.clientY, vbx: viewBoxRef.current.x, vby: viewBoxRef.current.y }
    if (svgRef.current) svgRef.current.style.cursor = 'grabbing'
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragging.current
    if (drag) {
      const pt = toSVGPoint(svgRef.current!, e.clientX, e.clientY)
      setPositions(prev => ({ ...prev, [drag.id]: { x: pt.x - drag.ox, y: pt.y - drag.oy } }))
      return
    }
    const pan = panning.current
    if (pan) {
      const rect = svgRef.current!.getBoundingClientRect()
      const vb = viewBoxRef.current
      const dx = (e.clientX - pan.sx) * (vb.w / rect.width)
      const dy = (e.clientY - pan.sy) * (vb.h / rect.height)
      setViewBox(prev => ({ ...prev, x: pan.vbx - dx, y: pan.vby - dy }))
    }
  }, [])

  const onMouseUp = useCallback(() => {
    dragging.current = null
    panning.current = null
    if (svgRef.current) svgRef.current.style.cursor = 'grab'
  }, [])

  return (
    <svg
      ref={svgRef}
      width="100%" height="100%"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onMouseDown={onSVGMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ userSelect: 'none', display: 'block', cursor: 'grab' }}
    >
      <defs>
        {/* Clean slim arrowhead — tip exactly at path endpoint (refX = marker width) */}
        <marker id="arr-f" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
          <path d="M0,0.8 L7,3.5 L0,6.2 Z" fill="#6366f1" opacity="0.75" />
        </marker>
        <marker id="arr-d" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto">
          <path d="M0,0.8 L7,3.5 L0,6.2 Z" fill="#06b6d4" opacity="0.75" />
        </marker>
      </defs>

      {/* Edges — behind nodes */}
      {edges.map((edge, i) => {
        const sp = positions[edge.source], tp = positions[edge.target]
        if (!sp || !tp) return null
        const isDir = baseNodes.find(n => n.id === edge.source)?.type === 'dir'

        let sx, sy, tx, ty: number
        if (direction === 'TB') {
          sx = sp.x + NODE_W / 2; sy = sp.y + NODE_H
          tx = tp.x + NODE_W / 2; ty = tp.y
        } else {
          sx = sp.x + NODE_W; sy = sp.y + NODE_H / 2
          tx = tp.x;           ty = tp.y + NODE_H / 2
        }
        const d = direction === 'TB'
          ? `M${sx},${sy} C${sx},${(sy+ty)/2} ${tx},${(sy+ty)/2} ${tx},${ty}`
          : `M${sx},${sy} C${(sx+tx)/2},${sy} ${(sx+tx)/2},${ty} ${tx},${ty}`

        return (
          <path key={i} d={d} fill="none"
            stroke={isDir ? '#06b6d4' : '#6366f1'}
            strokeWidth="1.4" strokeOpacity="0.5"
            markerEnd={isDir ? 'url(#arr-d)' : 'url(#arr-f)'}
          />
        )
      })}

      {/* Nodes — in front */}
      {baseNodes.map(node => {
        const pos = positions[node.id]
        if (!pos) return null
        const roleColor = node.role ? ROLE_COLOR[node.role] : (node.type === 'dir' ? '#facc15' : '#94a3b8')
        const ix = pos.x + (NODE_W - 22) / 2
        const iy = pos.y + 5

        return (
          <g key={node.id} onMouseDown={e => onNodeMouseDown(e, node.id)} style={{ cursor: 'grab' }}>
            {/* Full hit area */}
            <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} fill="transparent" />
            {/* Branded / generic icon */}
            <NodeIcon x={ix} y={iy} name={node.label} type={node.type} roleColor={roleColor} />
            {/* Label */}
            <text x={pos.x + NODE_W / 2} y={pos.y + 40}
              textAnchor="middle" fontSize="9" fontWeight="500"
              fill="var(--text)" fontFamily="Inter, system-ui, sans-serif">
              {node.label.length > 14 ? node.label.slice(0, 13) + '…' : node.label}
            </text>
            {/* Role badge */}
            {node.role && (
              <text x={pos.x + NODE_W / 2} y={pos.y + 52}
                textAnchor="middle" fontSize="7.5" fill={roleColor} opacity={0.85}
                fontFamily="Inter, system-ui, sans-serif">
                {node.role}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
