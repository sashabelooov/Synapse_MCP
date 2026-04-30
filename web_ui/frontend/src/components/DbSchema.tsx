import { useEffect, useState } from 'react'
import axios from 'axios'
import ReactFlow, {
  Background, Controls, BackgroundVariant,
  NodeProps, Handle, Position, useNodesState, useEdgesState,
  MarkerType, Edge,
} from 'reactflow'
import { Loader2 } from 'lucide-react'
import { useStore } from '../store/useStore'

interface Field { name: string; type: string }
interface Model { id: number; name: string; table_name: string; fields: Field[] }

// ── Relationship inference ────────────────────────────────────────────────────
function inferEdges(models: Model[]): Edge[] {
  const edges: Edge[] = []
  const nameToId = new Map<string, number>()

  for (const m of models) {
    nameToId.set(m.name.toLowerCase(), m.id)
    nameToId.set(m.table_name.toLowerCase(), m.id)
    // singular of table_name (strip trailing 's')
    const singular = m.table_name.toLowerCase().replace(/s$/, '')
    nameToId.set(singular, m.id)
  }

  for (const m of models) {
    for (const f of m.fields) {
      if (!f.name.endsWith('_id')) continue
      const ref = f.name.slice(0, -3).toLowerCase() // strip '_id'
      const targetId = nameToId.get(ref) ?? nameToId.get(ref + 's')
      if (targetId && targetId !== m.id) {
        const edgeId = `rel-${m.id}-${targetId}-${f.name}`
        if (!edges.find(e => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: `model-${m.id}`,
            target: `model-${targetId}`,
            label: f.name,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeOpacity: 0.7 },
            labelStyle: { fill: '#f59e0b', fontSize: 9, fontWeight: 600 },
            labelBgStyle: { fill: 'var(--bg-card)', fillOpacity: 0.85 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 12, height: 12 },
          })
        }
      }
    }
  }
  return edges
}

// ── Smart layout: models with most relationships go in the center ─────────────
function layoutModels(models: Model[], relEdges: Edge[]) {
  const W = 240   // node width
  const H_BASE = 80
  const ROW_H = 22
  const PAD_X = 60
  const PAD_Y = 60

  // Count connections per model
  const connCount = new Map<number, number>()
  for (const m of models) connCount.set(m.id, 0)
  for (const e of relEdges) {
    const srcId = parseInt((e.source as string).replace('model-', ''))
    const tgtId = parseInt((e.target as string).replace('model-', ''))
    connCount.set(srcId, (connCount.get(srcId) ?? 0) + 1)
    connCount.set(tgtId, (connCount.get(tgtId) ?? 0) + 1)
  }

  // Sort by connections descending so highly-connected models get central columns
  const sorted = [...models].sort((a, b) => (connCount.get(b.id) ?? 0) - (connCount.get(a.id) ?? 0))

  const COLS = Math.ceil(Math.sqrt(sorted.length * 1.3))
  const nodes = sorted.map((m, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const nodeH = H_BASE + m.fields.slice(0, 15).length * ROW_H
    return {
      id: `model-${m.id}`,
      type: 'dbModel',
      position: { x: col * (W + PAD_X), y: row * (nodeH + PAD_Y) },
      data: { name: m.name, table_name: m.table_name, fields: m.fields },
      style: { width: W },
    }
  })

  return nodes
}

// ── DB Model node ─────────────────────────────────────────────────────────────
const AMBER = '#f59e0b'

function DbModelNode({ data }: NodeProps) {
  const fields: Field[] = (data.fields as Field[]) || []
  return (
    <div style={{
      borderRadius: 10,
      border: `1.5px solid ${AMBER}55`,
      background: 'var(--bg-card)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      overflow: 'hidden',
      fontSize: 11,
      minWidth: 200,
    }}>
      <Handle type="target" position={Position.Left}
        style={{ background: AMBER, width: 8, height: 8, border: '2px solid var(--bg-card)', left: -5 }} />
      <Handle type="target" position={Position.Top}
        style={{ background: AMBER, width: 8, height: 8, border: '2px solid var(--bg-card)', top: -5 }} />

      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: `${AMBER}18`,
        borderBottom: `1px solid ${AMBER}33`,
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: `${AMBER}25`, border: `1.5px solid ${AMBER}60`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: AMBER, fontWeight: 800, flexShrink: 0,
        }}>⬡</div>
        <span style={{ fontWeight: 700, color: AMBER, fontSize: 12 }}>
          {data.name as string}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: `${AMBER}80`, fontFamily: 'monospace' }}>
          {data.table_name as string}
        </span>
      </div>

      {/* Fields */}
      <div>
        {fields.slice(0, 15).map((f, i) => {
          const isFk = f.name.endsWith('_id')
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px',
              borderBottom: `1px solid ${AMBER}0f`,
              background: isFk ? `${AMBER}08` : 'transparent',
            }}>
              {isFk && (
                <span style={{ fontSize: 8, color: AMBER, fontWeight: 700, flexShrink: 0 }}>FK</span>
              )}
              <span style={{ fontFamily: 'monospace', color: 'var(--text)', fontSize: 11 }}>
                {f.name}
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: 9, color: `${AMBER}90`,
                maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {f.type}
              </span>
            </div>
          )
        })}
        {fields.length > 15 && (
          <div style={{ padding: '4px 12px', color: 'var(--text-muted)', fontSize: 10 }}>
            +{fields.length - 15} more fields
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right}
        style={{ background: AMBER, width: 8, height: 8, border: '2px solid var(--bg-card)', right: -5 }} />
      <Handle type="source" position={Position.Bottom}
        style={{ background: AMBER, width: 8, height: 8, border: '2px solid var(--bg-card)', bottom: -5 }} />
    </div>
  )
}

const nodeTypes = { dbModel: DbModelNode }

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DbSchema() {
  const { projectPath } = useStore()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [modelCount, setModelCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    axios.get('/api/db-schema', { params: { path: projectPath } })
      .then(r => {
        const models: Model[] = r.data.models || []
        setModelCount(models.length)

        const relEdges = inferEdges(models)
        const layoutNodes = layoutModels(models, relEdges)

        setNodes(layoutNodes as any)
        setEdges(relEdges)
      })
      .finally(() => setLoading(false))
  }, [projectPath])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: 8 }}>
      <Loader2 size={18} className="animate-spin" /> Loading schema…
    </div>
  )

  if (modelCount === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
      No ORM models detected. Make sure your models use SQLAlchemy Base or Django Model.
    </div>
  )

  return (
    <div style={{ height: '100%', background: 'var(--bg)' }}>
      {/* Count badge */}
      <div style={{
        position: 'absolute', top: 16, right: 16, zIndex: 20,
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '4px 12px',
        fontSize: 11, color: 'var(--text-muted)',
      }}>
        {modelCount} models · {edges.length} relationships
      </div>

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.05}
        maxZoom={2}
        attributionPosition="bottom-left"
      >
        <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={20} size={1} />
        <Controls style={{ bottom: 16, left: 16, top: 'auto' }} />
      </ReactFlow>
    </div>
  )
}
