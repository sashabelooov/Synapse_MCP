import { useEffect, useState } from 'react'
import axios from 'axios'
import { Folder, FolderOpen, FileCode2, Loader2, List, GitGraph, ArrowDown, ArrowRight } from 'lucide-react'
import { useStore } from '../store/useStore'
import DraggableTreeGraph from './DraggableTreeGraph'

interface TreeNode {
  name: string
  type: 'file' | 'dir'
  path: string
  children?: TreeNode[]
}

const ROLE_COLOR: Record<string, string> = {
  model: '#f59e0b', schema: '#f97316', router: '#8b5cf6', view: '#8b5cf6',
  service: '#06b6d4', repository: '#10b981', entrypoint: '#6366f1',
  dependency: '#ec4899', middleware: '#ef4444', config: '#64748b',
  utility: '#64748b', admin: '#a78bfa', signal: '#34d399', task: '#fbbf24',
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

function FileNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2)
  const isDir = node.type === 'dir'
  const role = !isDir ? inferRole(node.name) : ''
  const color = role ? ROLE_COLOR[role] : undefined

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-0.5 rounded cursor-pointer transition-colors select-none"
        style={{
          paddingLeft: `${depth * 14 + 8}px`,
          paddingRight: '8px',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
        onClick={() => isDir && setOpen(!open)}
      >
        {isDir
          ? open
            ? <FolderOpen size={13} className="text-yellow-400 shrink-0" />
            : <Folder size={13} className="text-yellow-400 shrink-0" />
          : <FileCode2 size={13} style={{ color: color || 'var(--text-muted)' }} className="shrink-0" />}
        <span className="text-xs truncate" style={{ color: color || 'var(--text)' }}>
          {node.name}
        </span>
        {role && (
          <span
            className="ml-auto text-[9px] px-1.5 py-0.5 rounded shrink-0"
            style={{ background: `${color}22`, color }}
          >
            {role}
          </span>
        )}
      </div>
      {isDir && open && node.children?.map((child, i) => (
        <FileNode key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

type ViewMode = 'list' | 'graph'
type Direction = 'TB' | 'LR'

export default function ProjectTree() {
  const { projectPath } = useStore()
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [direction, setDirection] = useState<Direction>('TB')

  useEffect(() => {
    setLoading(true)
    axios.get('/api/tree', { params: { path: projectPath } })
      .then(r => setTree(r.data.tree))
      .finally(() => setLoading(false))
  }, [projectPath])

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="animate-spin mr-2" /> Loading tree…
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0"
           style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button
            onClick={() => setViewMode('list')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: viewMode === 'list' ? 'var(--nav-active)' : 'transparent',
              color: viewMode === 'list' ? '#818cf8' : 'var(--text-muted)',
            }}
          >
            <List size={13} /> Original Structure
          </button>
          <button
            onClick={() => setViewMode('graph')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: viewMode === 'graph' ? 'var(--nav-active)' : 'transparent',
              color: viewMode === 'graph' ? '#818cf8' : 'var(--text-muted)',
              borderLeft: '1px solid var(--border)',
            }}
          >
            <GitGraph size={13} /> Tree Structure
          </button>
        </div>

        {viewMode === 'graph' && (
          <div className="flex rounded-lg overflow-hidden ml-2" style={{ border: '1px solid var(--border)' }}>
            <button
              onClick={() => setDirection('TB')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
              title="Top to bottom"
              style={{
                background: direction === 'TB' ? 'var(--nav-active)' : 'transparent',
                color: direction === 'TB' ? '#818cf8' : 'var(--text-muted)',
              }}
            >
              <ArrowDown size={13} /> Top–Bottom
            </button>
            <button
              onClick={() => setDirection('LR')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
              title="Left to right"
              style={{
                background: direction === 'LR' ? 'var(--nav-active)' : 'transparent',
                color: direction === 'LR' ? '#818cf8' : 'var(--text-muted)',
                borderLeft: '1px solid var(--border)',
              }}
            >
              <ArrowRight size={13} /> Left–Right
            </button>
          </div>
        )}

        <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
          {viewMode === 'graph' ? 'Drag to move nodes · Scroll to zoom' : 'Click folders to expand'}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'list' ? (
          <div className="flex h-full">
            {/* Legend */}
            <aside className="w-48 shrink-0 py-3 px-3 overflow-y-auto"
                   style={{ borderRight: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                File Roles
              </p>
              {Object.entries(ROLE_COLOR).map(([role, color]) => (
                <div key={role} className="mb-1.5">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium"
                    style={{ background: `${color}1a`, color, border: `1px solid ${color}40` }}
                  >
                    {role}
                  </span>
                </div>
              ))}
            </aside>
            <div className="flex-1 overflow-y-auto py-2">
              {tree && <FileNode node={tree} depth={0} />}
            </div>
          </div>
        ) : (
          <div className="w-full h-full">
            {tree && <DraggableTreeGraph root={tree} direction={direction} />}
          </div>
        )}
      </div>
    </div>
  )
}
