import { useCallback, useEffect, useRef, useState } from 'react'

interface TreeNode {
  name: string
  type: 'file' | 'dir'
  path: string
  children?: TreeNode[]
}

interface GraphNode {
  id: string
  label: string
  type: 'file' | 'dir'
  role: string
  x: number
  y: number
}

interface GraphEdge {
  source: string
  target: string
}

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

const NODE_W = 88
const NODE_H = 56
const H_GAP = 64
const V_GAP = 40

function subtreeSize(n: TreeNode): number {
  if (!n.children || n.children.length === 0) return 1
  return n.children.reduce((s, c) => s + subtreeSize(c), 0)
}

function buildGraph(root: TreeNode, direction: 'TB' | 'LR') {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const SW = NODE_W + H_GAP
  const SH = NODE_H + V_GAP

  function place(n: TreeNode, depth: number, leafOff: number) {
    const id = n.path
    const role = n.type === 'file' ? inferRole(n.name) : ''
    const size = subtreeSize(n)
    const center = leafOff + size / 2 - 0.5

    const x = direction === 'TB' ? center * SW : depth * SW
    const y = direction === 'TB' ? depth * SH : center * SH

    nodes.push({ id, label: n.name, type: n.type, role, x, y })

    if (n.children && n.children.length > 0) {
      let off = leafOff
      for (const child of n.children) {
        edges.push({ source: id, target: child.path })
        place(child, depth + 1, off)
        off += subtreeSize(child)
      }
    }
  }

  place(root, 0, 0)
  return { nodes, edges }
}

function toSVGPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  return pt.matrixTransform(svg.getScreenCTM()!.inverse())
}

function FolderIcon({ color }: { color: string }) {
  return (
    <>
      <path d="M1,5.5 Q1,3.5 3,3.5 L9.5,3.5 L11.5,6 L21,6 Q23,6 23,8 L23,19.5 Q23,21.5 21,21.5 L3,21.5 Q1,21.5 1,19.5 Z"
        fill={color} opacity={0.88} />
      <path d="M1,8.5 L23,8.5" stroke="rgba(0,0,0,0.18)" strokeWidth="0.7" />
    </>
  )
}

function FileIcon({ color }: { color: string }) {
  return (
    <>
      <path d="M3.5,1.5 L15,1.5 L20.5,7 L20.5,22.5 Q20.5,24 19,24 L3.5,24 Q2,24 2,22.5 L2,3 Q2,1.5 3.5,1.5 Z"
        fill="none" stroke={color} strokeWidth="1.6" />
      <path d="M15,1.5 L15,7 L20.5,7" fill="none" stroke={color} strokeWidth="1.6" />
      <line x1="5" y1="12" x2="17.5" y2="12" stroke={color} strokeWidth="1.1" opacity="0.5" />
      <line x1="5" y1="16" x2="13" y2="16" stroke={color} strokeWidth="1.1" opacity="0.5" />
    </>
  )
}

interface Props {
  root: TreeNode
  direction: 'TB' | 'LR'
}

export default function DraggableTreeGraph({ root, direction }: Props) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [baseNodes, setBaseNodes] = useState<GraphNode[]>([])
  const [viewBox, setViewBox] = useState({ x: -40, y: -40, w: 1200, h: 800 })

  const dragging = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const { nodes, edges: e } = buildGraph(root, direction)
    setBaseNodes(nodes)
    setEdges(e)
    const pos: Record<string, { x: number; y: number }> = {}
    nodes.forEach(n => { pos[n.id] = { x: n.x, y: n.y } })
    setPositions(pos)
    if (nodes.length > 0) {
      const maxX = Math.max(...nodes.map(n => n.x + NODE_W))
      const maxY = Math.max(...nodes.map(n => n.y + NODE_H))
      setViewBox({ x: -50, y: -50, w: maxX + 100, h: maxY + 100 })
    }
  }, [root, direction])

  // Wheel zoom — non-passive so we can preventDefault
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handle = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
      setViewBox(prev => {
        const svgMx = prev.x + (mx / rect.width) * prev.w
        const svgMy = prev.y + (my / rect.height) * prev.h
        const nw = Math.max(120, Math.min(8000, prev.w * factor))
        const nh = Math.max(80, Math.min(6000, prev.h * factor))
        return {
          x: svgMx - (mx / rect.width) * nw,
          y: svgMy - (my / rect.height) * nh,
          w: nw, h: nh,
        }
      })
    }
    el.addEventListener('wheel', handle, { passive: false })
    return () => el.removeEventListener('wheel', handle)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault()
    const svg = svgRef.current!
    const pt = toSVGPoint(svg, e.clientX, e.clientY)
    const pos = positions[id] ?? { x: 0, y: 0 }
    dragging.current = { id, ox: pt.x - pos.x, oy: pt.y - pos.y }
  }, [positions])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragging.current
    if (!drag) return
    const pt = toSVGPoint(svgRef.current!, e.clientX, e.clientY)
    setPositions(prev => ({ ...prev, [drag.id]: { x: pt.x - drag.ox, y: pt.y - drag.oy } }))
  }, [])

  const onMouseUp = useCallback(() => { dragging.current = null }, [])

  return (
    <svg
      ref={svgRef}
      width="100%" height="100%"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ userSelect: 'none', display: 'block' }}
    >
      <defs>
        {/* Arrowhead tip is at refX=6 — exactly at path endpoint */}
        <marker id="arr-file" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0.5, 6 3, 0 5.5" fill="#6366f1" opacity="0.65" />
        </marker>
        <marker id="arr-dir" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
          <polygon points="0 0.5, 6 3, 0 5.5" fill="#06b6d4" opacity="0.65" />
        </marker>
      </defs>

      {/* Edges — drawn first (behind nodes) */}
      {edges.map((edge, i) => {
        const sp = positions[edge.source]
        const tp = positions[edge.target]
        if (!sp || !tp) return null
        const isDir = baseNodes.find(n => n.id === edge.source)?.type === 'dir'

        let sx, sy, tx, ty: number
        if (direction === 'TB') {
          // parent bottom-center → child top-center
          sx = sp.x + NODE_W / 2; sy = sp.y + NODE_H
          tx = tp.x + NODE_W / 2; ty = tp.y
        } else {
          // parent right-center → child left-center
          sx = sp.x + NODE_W; sy = sp.y + NODE_H / 2
          tx = tp.x;           ty = tp.y + NODE_H / 2
        }

        // Standard S-curve: control points at mid-x (LR) or mid-y (TB)
        const d = direction === 'TB'
          ? `M${sx},${sy} C${sx},${(sy + ty) / 2} ${tx},${(sy + ty) / 2} ${tx},${ty}`
          : `M${sx},${sy} C${(sx + tx) / 2},${sy} ${(sx + tx) / 2},${ty} ${tx},${ty}`

        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={isDir ? '#06b6d4' : '#6366f1'}
            strokeWidth="1.3"
            strokeOpacity="0.45"
            markerEnd={isDir ? 'url(#arr-dir)' : 'url(#arr-file)'}
          />
        )
      })}

      {/* Nodes — drawn on top */}
      {baseNodes.map(node => {
        const pos = positions[node.id]
        if (!pos) return null
        const color = node.role
          ? ROLE_COLOR[node.role]
          : node.type === 'dir' ? '#facc15' : '#94a3b8'

        return (
          <g
            key={node.id}
            transform={`translate(${pos.x},${pos.y})`}
            onMouseDown={e => onMouseDown(e, node.id)}
            style={{ cursor: 'grab' }}
          >
            {/* Invisible hit area covering full node — ensures root + all nodes are draggable */}
            <rect x={0} y={0} width={NODE_W} height={NODE_H} fill="transparent" />

            {/* SVG icon */}
            <g transform={`translate(${NODE_W / 2 - 11}, 3) scale(0.9)`}>
              {node.type === 'dir'
                ? <FolderIcon color={color} />
                : <FileIcon color={color} />}
            </g>

            {/* Label */}
            <text
              x={NODE_W / 2} y={40}
              textAnchor="middle"
              fontSize="9"
              fontWeight="500"
              fill="var(--text)"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {node.label.length > 14 ? node.label.slice(0, 13) + '…' : node.label}
            </text>

            {/* Role */}
            {node.role && (
              <text
                x={NODE_W / 2} y={51}
                textAnchor="middle"
                fontSize="7.5"
                fill={color}
                opacity={0.85}
                fontFamily="Inter, system-ui, sans-serif"
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
