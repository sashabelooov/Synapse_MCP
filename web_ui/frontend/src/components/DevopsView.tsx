import { useEffect, useState } from 'react'
import axios from 'axios'
import ReactFlow, {
  Background, Controls, MiniMap, BackgroundVariant,
  NodeProps, Handle, Position, useNodesState, useEdgesState,
} from 'reactflow'
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { DevopsFile } from '../types'

const CATEGORY_ICON: Record<string, string> = {
  docker: '🐳', nginx: '🌐', github_actions: '⚙️', gitlab_ci: '🦊',
  circle_ci: '⭕', travis: '🔧', kubernetes: '☸️', terraform: '🏗️',
  ansible: '🤖', makefile: '📋', env: '🔑', requirements: '📦',
  pyproject: '📦', pre_commit: '🔒', app: '⬡',
}

function DevopsNode({ data }: NodeProps) {
  const icon = CATEGORY_ICON[data.category as string] || '📄'
  return (
    <div
      className="rounded border px-3 py-2 text-xs shadow-lg min-w-[160px] max-w-[240px]"
      style={{ background: `${data.color as string}18`, borderColor: data.color as string }}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.color as string }} />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <div>
          <div className="font-semibold truncate" style={{ color: data.color as string }}>
            {(data.label as string).split('/').pop()}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {data.category as string}
          </div>
        </div>
      </div>
      {data.details && Object.keys(data.details as object).length > 0 && (
        <div className="text-[10px] mt-1 pt-1" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          {Object.entries(data.details as Record<string, unknown>).slice(0, 3).map(([k, v]) => (
            <div key={k} className="truncate">
              <span style={{ color: 'var(--text-faint)' }}>{k}:</span>{' '}
              {Array.isArray(v) ? v.slice(0, 2).join(', ') : String(v).slice(0, 40)}
            </div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: data.color as string }} />
    </div>
  )
}

const nodeTypes = { devopsNode: DevopsNode }

function FileCard({ file }: { file: DevopsFile }) {
  const [open, setOpen] = useState(false)
  const icon = CATEGORY_ICON[file.category] || '📄'
  return (
    <div className="rounded mb-2 overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
        style={{ color: 'var(--text)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
        onClick={() => setOpen(!open)}
      >
        <span>{icon}</span>
        <span className="text-xs font-medium flex-1 truncate">{file.file}</span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{file.category}</span>
        {open
          ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
      </button>
      {open && (
        <pre className="px-3 py-2 text-[10px] overflow-x-auto"
             style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
          {JSON.stringify(file.summary, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default function DevopsView() {
  const { projectPath } = useStore()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [files, setFiles] = useState<DevopsFile[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'graph' | 'list'>('graph')

  useEffect(() => {
    setLoading(true)
    axios.get('/api/devops', { params: { path: projectPath } })
      .then(r => {
        setNodes(r.data.nodes || [])
        setEdges(r.data.edges || [])
        setFiles(r.data.files || [])
      })
      .finally(() => setLoading(false))
  }, [projectPath])

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="animate-spin mr-2" /> Scanning DevOps files…
    </div>
  )

  if (files.length === 0) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      No DevOps files detected (Dockerfile, docker-compose, CI/CD, K8s, Nginx…)
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
           style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {files.length} infra files detected
        </span>
        <div className="ml-auto flex gap-1">
          {(['graph', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-2 py-1 rounded text-xs transition-colors"
              style={{
                background: view === v ? '#6366f1' : 'transparent',
                color: view === v ? '#fff' : 'var(--text-muted)',
              }}
            >
              {v === 'graph' ? 'Architecture' : 'File Details'}
            </button>
          ))}
        </div>
      </div>

      {view === 'graph' ? (
        <div className="flex-1">
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(n) => (n.data?.color as string) || '#475569'}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            />
          </ReactFlow>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          {files.map((f, i) => <FileCard key={i} file={f} />)}
        </div>
      )}
    </div>
  )
}
