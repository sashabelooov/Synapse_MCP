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

// Layout constants — generous spacing to prevent overlaps
const ICON  = 44          // icon px
const CW    = 128         // cell width  (ICON + horizontal padding)
const CH    = 82          // cell height (label-above + ICON + role-below)
const H_GAP = 56          // gap between sibling cells (horizontal)
const V_GAP = 80          // gap between ranks (vertical)

// Icon centered inside cell
const IC_X = (CW - ICON) / 2   // 42
const IC_Y = 0

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function FolderIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width={ICON} height={ICON} viewBox="0 0 24 24">
      <path d="M10 4H4C2.89 4 2 4.89 2 6V18C2 19.11 2.89 20 4 20H20C21.11 20 22 19.11 22 18V8C22 6.89 21.11 6 20 6H12L10 4Z" fill="#F4C430"/>
    </svg>
  )
}

function PythonIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width={ICON} height={ICON} viewBox="0 0 110 110">
      <path d="M55.2 0C24.7 0 25.9 13.2 25.9 13.2L26 21.7H55.8V25.9H13.7C13.7 25.9 0 24.5 0 55.2C0 85.9 11.9 84.1 11.9 84.1L21.3 84.1V71.1C21.3 71.1 20.8 54.8 37.1 54.8H64.4C64.4 54.8 80.2 54.4 80.2 38.6V15.7C80.2 15.7 81.5 0 55.2 0ZM40.9 8.6C43.5 8.6 45.6 10.7 45.6 13.3C45.6 15.9 43.5 18 40.9 18C38.3 18 36.2 15.9 36.2 13.3C36.2 10.7 38.3 8.6 40.9 8.6Z" fill="#3776AB"/>
      <path d="M54.8 110C85.3 110 84.1 96.8 84.1 96.8L84 88.3H54.2V84.1H96.3C96.3 84.1 110 85.5 110 54.8C110 24.1 98.1 25.9 98.1 25.9L88.7 25.9V38.9C88.7 38.9 89.2 55.2 72.9 55.2H45.6C45.6 55.2 29.8 55.6 29.8 71.4V94.3C29.8 94.3 28.5 110 54.8 110ZM69.1 101.4C66.5 101.4 64.4 99.3 64.4 96.7C64.4 94.1 66.5 92 69.1 92C71.7 92 73.8 94.1 73.8 96.7C73.8 99.3 71.7 101.4 69.1 101.4Z" fill="#FFD43B"/>
    </svg>
  )
}

function DockerIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width={ICON} height={ICON} viewBox="0 0 24 24" fill="#2496ED">
      <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.186.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.186.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.186.186 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z"/>
    </svg>
  )
}

function EnvIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width={ICON} height={ICON} viewBox="0 0 24 24" fill="#94a3b8">
      <path d="M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm7.43-2.47c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.49.49 0 0 0 14 3h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 12c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.73 1.69.98l.38 2.65c.09.42.46.42.49.42h4c.03 0 .4 0 .49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"/>
    </svg>
  )
}

function GitHubIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width={ICON} height={ICON} viewBox="0 0 24 24">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" fill="#94a3b8"/>
    </svg>
  )
}

function GenericFileIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <svg x={x} y={y} width={ICON} height={ICON} viewBox="0 0 24 24">
      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" fill={color} opacity="0.85"/>
    </svg>
  )
}

function NodeIcon({ x, y, name, type, roleColor }: {
  x: number; y: number; name: string; type: 'file' | 'dir'; roleColor: string
}) {
  const n = name.toLowerCase()
  if (type === 'dir') {
    if (n === '.github' || n === 'github') return <GitHubIcon x={x} y={y} />
    return <FolderIcon x={x} y={y} />
  }
  if (n.endsWith('.py')) return <PythonIcon x={x} y={y} />
  if (n.startsWith('dockerfile') || n === 'docker-compose.yml' || n === 'docker-compose.yaml' || n.startsWith('docker-compose')) return <DockerIcon x={x} y={y} />
  if (n.includes('github') || n === '.gitignore') return <GitHubIcon x={x} y={y} />
  if (n === '.env' || n.startsWith('.env') || n.endsWith('.env') || n.includes('.env')) return <EnvIcon x={x} y={y} />
  return <GenericFileIcon x={x} y={y} color={roleColor} />
}

// ── Layout ────────────────────────────────────────────────────────────────────

// Fix #5: sort children — dirs first, then files, both alphabetical
function sortedChildren(children: TreeNode[]): TreeNode[] {
  return [...children].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function subtreeSize(n: TreeNode): number {
  if (!n.children?.length) return 1
  return sortedChildren(n.children).reduce((s, c) => s + subtreeSize(c), 0)
}

function buildGraph(root: TreeNode, direction: 'TB' | 'LR') {
  const nodes: GraphNode[] = [], edges: GraphEdge[] = []
  const SW = CW + H_GAP   // total horizontal step
  const SH = CH + V_GAP   // total vertical step

  function place(n: TreeNode, depth: number, leafOff: number) {
    const size = subtreeSize(n)
    const center = leafOff + size / 2 - 0.5
    nodes.push({
      id: n.path, label: n.name, type: n.type,
      role: n.type === 'file' ? inferRole(n.name) : '',
      x: direction === 'TB' ? center * SW : depth * SW,
      y: direction === 'TB' ? depth * SH  : center * SH,
    })
    if (n.children?.length) {
      let off = leafOff
      for (const c of sortedChildren(n.children)) {
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

// Fix #3: edge connection points strictly by direction
function edgePoints(
  sp: { x: number; y: number },
  tp: { x: number; y: number },
  direction: 'TB' | 'LR'
) {
  // Icon top-left within cell
  const six = sp.x + IC_X, siy = sp.y + IC_Y
  const tix = tp.x + IC_X, tiy = tp.y + IC_Y

  if (direction === 'TB') {
    // source: bottom-center of icon; target: top-center of icon
    return {
      sx: six + ICON / 2, sy: siy + ICON,
      tx: tix + ICON / 2, ty: tiy,
    }
  } else {
    // source: right-center of icon; target: left-center of icon
    return {
      sx: six + ICON, sy: siy + ICON / 2,
      tx: tix,        ty: tiy + ICON / 2,
    }
  }
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props { root: TreeNode; direction: 'TB' | 'LR' }

export default function DraggableTreeGraph({ root, direction }: Props) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [baseNodes, setBaseNodes] = useState<GraphNode[]>([])
  const [viewBox, setViewBox] = useState({ x: -80, y: -80, w: 1400, h: 900 })

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
      const pad = 80
      const MAX_W = 1100
      const MAX_H = 700
      const totalW = Math.max(...nodes.map(n => n.x + CW)) + pad * 2
      const totalH = Math.max(...nodes.map(n => n.y + CH)) + pad * 2
      const vbW = Math.min(totalW, MAX_W)
      const vbH = Math.min(totalH, MAX_H)

      // nodes[0] is the root (placed first in buildGraph)
      const rootNode = nodes[0]
      if (direction === 'LR') {
        // Root is at x≈0 — start viewport just before it, center vertically on it
        setViewBox({ x: rootNode.x - pad, y: rootNode.y + CH / 2 - vbH / 2, w: vbW, h: vbH })
      } else {
        // Root is at y≈0 — start viewport just above it, center horizontally on it
        setViewBox({ x: rootNode.x + CW / 2 - vbW / 2, y: rootNode.y - pad, w: vbW, h: vbH })
      }
    }
  }, [root, direction])

  // Wheel zoom (non-passive)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handle = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
      setViewBox(prev => {
        const vbmx = prev.x + (mx / rect.width)  * prev.w
        const vbmy = prev.y + (my / rect.height) * prev.h
        const nw = Math.max(200, Math.min(12000, prev.w * factor))
        const nh = Math.max(120, Math.min(9000,  prev.h * factor))
        return { x: vbmx - (mx / rect.width) * nw, y: vbmy - (my / rect.height) * nh, w: nw, h: nh }
      })
    }
    el.addEventListener('wheel', handle, { passive: false })
    return () => el.removeEventListener('wheel', handle)
  }, [])

  const onNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation()
    const pt = toSVGPoint(svgRef.current!, e.clientX, e.clientY)
    const pos = positions[id] ?? { x: 0, y: 0 }
    dragging.current = { id, ox: pt.x - pos.x, oy: pt.y - pos.y }
    if (svgRef.current) svgRef.current.style.cursor = 'grabbing'
  }, [positions])

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
    dragging.current = null; panning.current = null
    if (svgRef.current) svgRef.current.style.cursor = 'grab'
  }, [])

  const ARROW_COLOR_DIR  = '#facc15'
  const ARROW_COLOR_FILE = '#6366f1'

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
        {/* Fix #2: closed arrowhead, refX at tip */}
        <marker id="arr-dir"  markerWidth="9" markerHeight="9" refX="9" refY="4.5" orient="auto">
          <path d="M0,0.5 L9,4.5 L0,8.5 Z" fill={ARROW_COLOR_DIR} />
        </marker>
        <marker id="arr-file" markerWidth="9" markerHeight="9" refX="9" refY="4.5" orient="auto">
          <path d="M0,0.5 L9,4.5 L0,8.5 Z" fill={ARROW_COLOR_FILE} />
        </marker>
      </defs>

      {/* Edges */}
      {edges.map((edge, i) => {
        const sp = positions[edge.source], tp = positions[edge.target]
        if (!sp || !tp) return null
        const isDir = baseNodes.find(n => n.id === edge.source)?.type === 'dir'
        const { sx, sy, tx, ty } = edgePoints(sp, tp, direction)

        // Fix #3: bezier control points follow the direction strictly
        const mx = (sx + tx) / 2, my = (sy + ty) / 2
        const d = direction === 'TB'
          ? `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`
          : `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`

        return (
          <path key={i} d={d} fill="none"
            stroke={isDir ? ARROW_COLOR_DIR : ARROW_COLOR_FILE}
            strokeWidth="1.4" strokeOpacity="0.55"
            markerEnd={isDir ? 'url(#arr-dir)' : 'url(#arr-file)'}
          />
        )
      })}

      {/* Nodes — icon + label, no background */}
      {baseNodes.map(node => {
        const pos = positions[node.id]
        if (!pos) return null
        const roleColor = node.role ? ROLE_COLOR[node.role] : (node.type === 'dir' ? '#facc15' : '#94a3b8')
        const ix = pos.x + IC_X, iy = pos.y + IC_Y

        return (
          <g key={node.id} onMouseDown={e => onNodeMouseDown(e, node.id)} style={{ cursor: 'grab' }}>
            {/* Hit area */}
            <rect x={pos.x} y={pos.y} width={CW} height={CH} fill="transparent" />
            <NodeIcon x={ix} y={iy} name={node.label} type={node.type} roleColor={roleColor} />
            <text
              x={pos.x + CW / 2} y={pos.y + IC_Y + ICON + 17}
              textAnchor="middle" fontSize="12" fontWeight="600"
              fill="var(--text)" fontFamily="Inter, system-ui, sans-serif"
              style={{ pointerEvents: 'none' }}
            >
              {node.label.length > 14 ? node.label.slice(0, 13) + '…' : node.label}
            </text>
            {node.role && (
              <text
                x={pos.x + CW / 2} y={pos.y + IC_Y + ICON + 31}
                textAnchor="middle" fontSize="10" fontWeight="500" fill={roleColor} opacity={0.9}
                fontFamily="Inter, system-ui, sans-serif"
                style={{ pointerEvents: 'none' }}
              >
                {node.role}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
