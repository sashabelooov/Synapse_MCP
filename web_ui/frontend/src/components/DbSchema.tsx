import { useEffect, useState } from 'react'
import axios from 'axios'
import ReactFlow, {
  Background, Controls, BackgroundVariant,
  NodeProps, Handle, Position, useNodesState, useEdgesState,
} from 'reactflow'
import { Loader2 } from 'lucide-react'
import { useStore } from '../store/useStore'

interface Field { name: string; type: string }

function DbModelNode({ data }: NodeProps) {
  const fields: Field[] = (data.fields as Field[]) || []
  return (
    <div className="rounded border min-w-[200px] text-xs shadow-xl overflow-hidden"
         style={{ borderColor: '#f59e0b', background: '#f59e0b11' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#f59e0b' }} />
      <div className="px-3 py-1.5 font-bold flex items-center gap-2"
           style={{ background: '#f59e0b22', color: '#f59e0b' }}>
        <span>⬡</span>
        <span>{data.name as string}</span>
        <span className="ml-auto text-[10px] opacity-60">{data.table_name as string}</span>
      </div>
      <div style={{ borderTop: '1px solid #f59e0b22' }}>
        {fields.slice(0, 15).map((f, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-1"
               style={{ borderBottom: '1px solid #f59e0b11' }}>
            <span className="font-mono" style={{ color: 'var(--text)' }}>{f.name}</span>
            <span className="ml-auto text-[10px] truncate max-w-[100px]"
                  style={{ color: '#f59e0b99' }}>{f.type}</span>
          </div>
        ))}
        {fields.length > 15 && (
          <div className="px-3 py-1" style={{ color: 'var(--text-muted)' }}>
            …{fields.length - 15} more
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#f59e0b' }} />
    </div>
  )
}

const nodeTypes = { dbModel: DbModelNode }

export default function DbSchema() {
  const { projectPath } = useStore()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [models, setModels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    axios.get('/api/db-schema', { params: { path: projectPath } })
      .then(r => {
        setNodes(r.data.nodes || [])
        setEdges(r.data.edges || [])
        setModels(r.data.models || [])
      })
      .finally(() => setLoading(false))
  }, [projectPath])

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="animate-spin mr-2" /> Loading schema…
    </div>
  )

  if (models.length === 0) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      No ORM models detected. Make sure your models file uses SQLAlchemy Base or Django Model.
    </div>
  )

  return (
    <div className="flex h-full">
      <aside className="w-48 shrink-0 overflow-y-auto p-2"
             style={{ borderRight: '1px solid var(--border)' }}>
        <p className="text-[10px] uppercase tracking-wider px-1 mb-2"
           style={{ color: 'var(--text-muted)' }}>
          {models.length} Models
        </p>
        {models.map((m, i) => (
          <div key={i} className="px-2 py-1.5 rounded cursor-pointer transition-colors"
               onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-hover)')}
               onMouseLeave={e => (e.currentTarget.style.background = '')}>
            <div className="text-xs font-medium" style={{ color: '#f59e0b' }}>{m.name}</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{m.table_name}</div>
          </div>
        ))}
      </aside>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={20} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
