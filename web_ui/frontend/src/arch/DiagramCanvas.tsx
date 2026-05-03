import { useCallback, useMemo, memo } from 'react'
import ReactFlow, {
  Controls,
  useNodesState, useEdgesState, addEdge,
  Handle, Position, NodeProps, Connection, Edge, Node,
  MarkerType, getBezierPath, EdgeProps, BaseEdge, EdgeLabelRenderer,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { TechIcon, getIconColor } from './icons'
import type { ArchNodeData, DiagramData } from './types'

// ── Custom Node ──────────────────────────────────────────────────────────────

const ArchNode = memo(function ArchNode({ data, selected }: NodeProps<ArchNodeData>) {
  const color = getIconColor(data.icon, data.color)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
      padding: '10px 14px 10px',
      borderRadius: 12,
      background: selected ? 'rgba(88,166,255,0.08)' : 'transparent',
      border: selected ? '1.5px solid rgba(88,166,255,0.4)' : '1.5px solid transparent',
      transition: 'border-color 0.15s, background 0.15s',
      cursor: 'default',
      minWidth: 72,
    }}>
      <Handle type="target" position={Position.Top} style={{ background: 'rgba(88,166,255,0.5)', width: 7, height: 7, border: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'rgba(88,166,255,0.5)', width: 7, height: 7, border: 'none' }} />
      <Handle type="target" position={Position.Left} style={{ background: 'rgba(88,166,255,0.5)', width: 7, height: 7, border: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'rgba(88,166,255,0.5)', width: 7, height: 7, border: 'none' }} />

      <div style={{
        width: 46, height: 46, borderRadius: 11,
        background: `${color}18`,
        border: `1.5px solid ${color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'border-color 0.15s',
      }}>
        <TechIcon name={data.icon} size={22} color={color} />
      </div>

      <span style={{
        fontSize: 11, fontWeight: 600, color: 'var(--text)',
        textAlign: 'center', maxWidth: 90, lineHeight: 1.3,
        fontFamily: 'inherit',
        userSelect: 'none',
      }}>
        {data.label}
      </span>
    </div>
  )
})

// ── Custom Edge ──────────────────────────────────────────────────────────────

function ArchEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, label,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const isDashed = data?.style === 'dashed'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: 'rgba(255,255,255,0.25)',
          strokeWidth: 1.5,
          strokeDasharray: isDashed ? '8 4' : undefined,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10, fontWeight: 500,
              color: 'rgba(255,255,255,0.55)',
              background: 'var(--bg-main)',
              padding: '2px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
              fontFamily: 'inherit',
            }}
            className="nodrag nopan"
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

// ── Group Node (background layer) ─────────────────────────────────────────────

const GroupNode = memo(function GroupNode({ data }: NodeProps) {
  return (
    <div style={{
      width: '100%', height: '100%',
      borderRadius: 16,
      border: `1px dashed ${data.color ?? '#58a6ff'}40`,
      background: `${data.color ?? '#58a6ff'}06`,
      position: 'relative',
    }}>
      <span style={{
        position: 'absolute', top: 10, left: 14,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        color: `${data.color ?? '#58a6ff'}99`,
        textTransform: 'uppercase', userSelect: 'none',
        fontFamily: 'inherit',
      }}>
        {data.label}
      </span>
    </div>
  )
})

// ── Node / Edge type maps — defined outside component to avoid re-renders ────

const NODE_TYPES = { arch: ArchNode, group: GroupNode }
const EDGE_TYPES = { arch: ArchEdge }

// ── Converter: DiagramData → ReactFlow nodes/edges ───────────────────────────

export function diagramToFlow(diagram: DiagramData) {
  const groupNodes: Node[] = diagram.groups.map(g => ({
    id: g.id,
    type: 'group',
    position: { x: g.x ?? 0, y: g.y ?? 0 },
    style: { width: g.width ?? 300, height: g.height ?? 200 },
    data: { label: g.label, color: g.color },
    selectable: false,
    draggable: false,
  }))

  const archNodes: Node<ArchNodeData>[] = diagram.nodes.map(n => ({
    id: n.id,
    type: 'arch',
    position: { x: n.x, y: n.y },
    data: { label: n.label, icon: n.icon, nodeType: n.nodeType, color: n.color },
  }))

  const edges: Edge[] = diagram.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'arch',
    label: e.label,
    data: { style: e.style },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(255,255,255,0.3)', width: 14, height: 14 },
  }))

  return { nodes: [...groupNodes, ...archNodes], edges }
}

// ── Main Canvas component ─────────────────────────────────────────────────────

interface DiagramCanvasProps {
  diagram: DiagramData | null
  onDiagramChange?: (nodes: Node[], edges: Edge[]) => void
}

function DiagramCanvasInner({ diagram, onDiagramChange }: DiagramCanvasProps) {
  const initial = useMemo(() => diagram ? diagramToFlow(diagram) : { nodes: [], edges: [] }, [diagram])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)

  // Sync when diagram prop changes
  useMemo(() => {
    if (diagram) {
      const { nodes: n, edges: e } = diagramToFlow(diagram)
      setNodes(n)
      setEdges(e)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram])

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({ ...params, type: 'arch', markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(255,255,255,0.3)', width: 14, height: 14 } }, eds)),
    [setEdges]
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={changes => { onNodesChange(changes); onDiagramChange?.(nodes, edges) }}
      onEdgesChange={changes => { onEdgesChange(changes); onDiagramChange?.(nodes, edges) }}
      onConnect={onConnect}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      style={{ background: 'transparent' }}
    >
      {/* Background hidden — CSS dot grid from parent shows through */}
      <Controls
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
      />
    </ReactFlow>
  )
}

export default function DiagramCanvas(props: DiagramCanvasProps) {
  return (
    <ReactFlowProvider>
      <DiagramCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
