import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import ReactFlow, {
  Background, Controls, MiniMap, BackgroundVariant,
  NodeProps, Handle, Position, useNodesState, useEdgesState,
} from 'reactflow'
import { Loader2, Search } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { RFNode, RFEdge } from '../types'

function CustomNode({ data }: NodeProps) {
  return (
    <div
      className="rounded border px-3 py-2 text-xs shadow-lg min-w-[140px] max-w-[220px]"
      style={{ background: `${data.color as string}18`, borderColor: data.color as string }}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.color as string }} />
      <div className="font-semibold truncate" style={{ color: data.color as string }}>
        {data.label as string}
        {data.is_async && <span className="ml-1 text-[10px] opacity-60">async</span>}
      </div>
      <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
        {data.qualified_name as string}
      </div>
      <div className="text-[10px] mt-1 px-1 py-0.5 rounded"
           style={{ background: `${data.color as string}33`, color: data.color as string }}>
        {data.file_role as string}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: data.color as string }} />
    </div>
  )
}

const nodeTypes = { custom: CustomNode }

export default function CallGraph() {
  const { projectPath } = useStore()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)

  const load = useCallback(async (fn?: string) => {
    setLoading(true)
    try {
      const params: Record<string, string> = { path: projectPath }
      if (fn) params.function_name = fn
      const { data } = await axios.get('/api/call-graph', { params })
      setNodes(data.nodes || [])
      setEdges(data.edges || [])
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }, [projectPath])

  useEffect(() => { load() }, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearching(true)
    load(search.trim() || undefined)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="animate-spin mr-2" /> Building call graph…
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
           style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <input
            className="syn-input rounded px-2 py-1 text-xs w-52"
            placeholder="Filter by function name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button type="submit" disabled={searching}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
            style={{ background: 'var(--nav-hover)', color: 'var(--text-muted)' }}>
            {searching ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
            {search ? 'Subgraph' : 'Full graph'}
          </button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); load() }}
              className="px-2 py-1 text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}>
              Reset
            </button>
          )}
        </form>
        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
        >
          <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => (n.data?.color as string) || '#475569'}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}
