import { useEffect, useState } from 'react'
import axios from 'axios'
import { Folder, FolderOpen, Loader2, List, ArrowDown, ArrowRight } from 'lucide-react'
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
  const lower = name.toLowerCase()
  if (lower === '.env' || lower.startsWith('.env.') || lower.endsWith('.env')) return 'config'
  const n = lower.replace('.py', '')
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

function FileIconSmall({ name, role }: { name: string; role: string }) {
  const n = name.toLowerCase()
  const color = role ? ROLE_COLOR[role] : '#94a3b8'

  if (n.endsWith('.py')) return (
    <svg width="13" height="13" viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
      <path d="M55.2 0C24.7 0 25.9 13.2 25.9 13.2L26 21.7H55.8V25.9H13.7C13.7 25.9 0 24.5 0 55.2C0 85.9 11.9 84.1 11.9 84.1L21.3 84.1V71.1C21.3 71.1 20.8 54.8 37.1 54.8H64.4C64.4 54.8 80.2 54.4 80.2 38.6V15.7C80.2 15.7 81.5 0 55.2 0ZM40.9 8.6C43.5 8.6 45.6 10.7 45.6 13.3C45.6 15.9 43.5 18 40.9 18C38.3 18 36.2 15.9 36.2 13.3C36.2 10.7 38.3 8.6 40.9 8.6Z" fill="#3776AB"/>
      <path d="M54.8 110C85.3 110 84.1 96.8 84.1 96.8L84 88.3H54.2V84.1H96.3C96.3 84.1 110 85.5 110 54.8C110 24.1 98.1 25.9 98.1 25.9L88.7 25.9V38.9C88.7 38.9 89.2 55.2 72.9 55.2H45.6C45.6 55.2 29.8 55.6 29.8 71.4V94.3C29.8 94.3 28.5 110 54.8 110ZM69.1 101.4C66.5 101.4 64.4 99.3 64.4 96.7C64.4 94.1 66.5 92 69.1 92C71.7 92 73.8 94.1 73.8 96.7C73.8 99.3 71.7 101.4 69.1 101.4Z" fill="#FFD43B"/>
    </svg>
  )

  if (n.startsWith('dockerfile') || n.includes('docker-compose') || n === 'docker-compose.yml' || n === 'docker-compose.yaml') return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#2496ED" style={{ flexShrink: 0 }}>
      <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.186.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.186.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.186.186 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z"/>
    </svg>
  )

  if (n.endsWith('.ts') || n.endsWith('.tsx')) return (
    <svg width="13" height="13" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <rect width="24" height="24" rx="3" fill="#3178C6"/>
      <path d="M3 13.5h3.75v8.25h1.75V13.5H12V12H3v1.5zm10.25-1.5v9.75h1.75v-3.75H18v3.75h1.75V12h-1.75v4.25h-2.75V12h-1.75z" fill="white"/>
    </svg>
  )

  if (n.endsWith('.js') || n.endsWith('.jsx') || n.endsWith('.mjs')) return (
    <svg width="13" height="13" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <rect width="24" height="24" rx="3" fill="#F7DF1E"/>
      <path d="M7 17.5c.4.8 1.1 1.5 2.5 1.5s2.5-.8 2.5-2.5V12H10v4.5c0 .8-.3 1-1 1s-1-.3-1.3-1L7 17.5zm7-.3c.5 1.2 1.6 1.8 3 1.8 1.8 0 3-1 3-2.5 0-1.4-.8-2-2.3-2.6l-.5-.2c-.7-.3-1.2-.6-1.2-1.1 0-.5.4-.8 1-.8s1 .3 1.3.9l1.6-1c-.5-1-1.4-1.7-2.9-1.7-1.7 0-2.8 1-2.8 2.4 0 1.4.8 2 2.2 2.6l.5.2c.8.4 1.3.6 1.3 1.2s-.5 1-1.2 1c-.9 0-1.5-.5-1.9-1.3L14 17.2z" fill="#1a1a1a"/>
    </svg>
  )

  if (n.endsWith('.json')) return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" style={{ flexShrink: 0 }}>
      <path d="M5 3h2v2H5v5a2 2 0 01-2 2 2 2 0 012 2v5h2v2H5c-1.07-.27-2-.9-2-2v-4a2 2 0 00-2-2H0v-2h1a2 2 0 002-2V5a2 2 0 012-2m14 0a2 2 0 012 2v4a2 2 0 002 2h1v2h-1a2 2 0 00-2 2v4a2 2 0 01-2 2h-2v-2h2v-5a2 2 0 012-2 2 2 0 01-2-2V5h-2V3h2M12 15a1 1 0 011 1 1 1 0 01-1 1 1 1 0 01-1-1 1 1 0 011-1m-4 0a1 1 0 011 1 1 1 0 01-1 1 1 1 0 01-1-1 1 1 0 011-1m8 0a1 1 0 011 1 1 1 0 01-1 1 1 1 0 01-1-1 1 1 0 011-1z"/>
    </svg>
  )

  if (n.endsWith('.yml') || n.endsWith('.yaml')) return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#f97316" style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM10 19l2-4h-2v-4h4v4l-2 4h-2z"/>
    </svg>
  )

  if (n.endsWith('.md') || n.endsWith('.mdx')) return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#94a3b8" style={{ flexShrink: 0 }}>
      <path d="M20.56 18H3.44C2.65 18 2 17.37 2 16.59V7.41C2 6.63 2.65 6 3.44 6h17.12C21.35 6 22 6.63 22 7.41v9.18c0 .78-.65 1.41-1.44 1.41M6.81 15.19v-3.66l1.92 2.35 1.92-2.35v3.66h1.93V8.81h-1.93l-1.92 2.35-1.92-2.35H4.89v6.38h1.92M19.19 12h-1.92V8.81h-1.93V12h-1.92l2.89 3.28L19.19 12z"/>
    </svg>
  )

  if (n === '.env' || n.startsWith('.env') || n.endsWith('.env')) return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#94a3b8" style={{ flexShrink: 0 }}>
      <path d="M12 15.5a3.5 3.5 0 010-7 3.5 3.5 0 010 7zm7.43-2.47c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.49.49 0 0014 3h-4a.49.49 0 00-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 12c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.73 1.69.98l.38 2.65c.09.42.46.42.49.42h4c.03 0 .4 0 .49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"/>
    </svg>
  )

  if (n === '.gitignore' || n === '.gitattributes' || n.endsWith('.git')) return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#94a3b8" style={{ flexShrink: 0 }}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  )

  if (n.endsWith('.css') || n.endsWith('.scss') || n.endsWith('.sass')) return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#2965f1" style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM9 13v6H7v-6h2zm4-2v8h-2v-8h2zm4 3v5h-2v-5h2z"/>
    </svg>
  )

  if (n.endsWith('.html') || n.endsWith('.htm')) return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#e44d26" style={{ flexShrink: 0 }}>
      <path d="M1.5 0h21l-1.91 21.563L11.977 24l-8.565-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.326 3.426-2.91.804-2.955-.81-.188-2.11H6.248l.33 4.171L12 19.351l5.379-1.443.744-8.157H8.531z"/>
    </svg>
  )

  if (n.endsWith('.toml') || n.endsWith('.ini') || n.endsWith('.cfg')) return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#94a3b8" style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17v-2h8v2H8zm0-4v-2h8v2H8zm0-4V7h5v2H8z"/>
    </svg>
  )

  if (n.endsWith('.sh') || n === 'makefile') return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#34d399" style={{ flexShrink: 0 }}>
      <path d="M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z"/>
    </svg>
  )

  return (
    <svg width="13" height="13" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z" fill={color} opacity="0.9"/>
    </svg>
  )
}

function nodeMatchesFilter(node: TreeNode, activeRoles: Set<string>): boolean {
  if (activeRoles.size === 0) return true
  if (node.type === 'file') return activeRoles.has(inferRole(node.name))
  return node.children?.some(c => nodeMatchesFilter(c, activeRoles)) ?? false
}

function FileNode({ node, depth = 0, activeRoles }: { node: TreeNode; depth?: number; activeRoles: Set<string> }) {
  const [open, setOpen] = useState(depth < 2)
  const isDir = node.type === 'dir'
  const role = !isDir ? inferRole(node.name) : ''
  const color = role ? ROLE_COLOR[role] : undefined
  const isFiltered = activeRoles.size > 0

  if (!nodeMatchesFilter(node, activeRoles)) return null

  const showChildren = isDir && (open || isFiltered)

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-0.5 rounded cursor-pointer select-none"
        style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: '8px', transition: 'background 0.1s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
        onClick={() => isDir && setOpen(o => !o)}
      >
        {isDir
          ? showChildren
            ? <FolderOpen size={13} className="text-yellow-400 shrink-0" />
            : <Folder size={13} className="text-yellow-400 shrink-0" />
          : <FileIconSmall name={node.name} role={role} />
        }
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
      {showChildren && node.children?.map((child, i) => (
        <FileNode key={i} node={child} depth={depth + 1} activeRoles={activeRoles} />
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
  const [activeRoles, setActiveRoles] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    axios.get('/api/tree', { params: { path: projectPath } })
      .then(r => setTree(r.data.tree))
      .finally(() => setLoading(false))
  }, [projectPath])

  function toggleRole(role: string) {
    setActiveRoles(prev => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="animate-spin mr-2" /> Loading tree…
    </div>
  )

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 53, zIndex: 10,
        pointerEvents: 'none',
      }}>
        {/* Pill — pinned to exact horizontal center of the viewport */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex', background: 'var(--bg-input)', borderRadius: 9999,
          padding: 3, gap: 2, border: '1px solid var(--border)', pointerEvents: 'auto',
          whiteSpace: 'nowrap',
        }}>
          {([
            { mode: 'list' as ViewMode, dir: null,  Icon: List,       label: 'ORIGINAL STRUCTURE' },
            { mode: 'graph' as ViewMode, dir: 'TB', Icon: ArrowDown,  label: 'TOP-BOTTOM' },
            { mode: 'graph' as ViewMode, dir: 'LR', Icon: ArrowRight, label: 'LEFT-RIGHT' },
          ]).map(({ mode, dir, Icon, label }) => {
            const active = viewMode === mode && (mode === 'list' || direction === dir)
            return (
              <button
                key={label}
                onClick={() => { setViewMode(mode); if (dir) setDirection(dir as Direction) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 14px', borderRadius: 9999, border: 'none',
                  fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: active ? 'var(--text)' : 'transparent',
                  color: active ? 'var(--bg)' : 'var(--text-muted)',
                }}
              >
                <Icon size={12} /> {label}
              </button>
            )
          })}
        </div>
        {/* Hint text — far right */}
        <span style={{
          position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          {viewMode === 'graph' ? 'Drag · Scroll to zoom · Pan canvas' : 'Click folders to expand'}
        </span>
      </div>

      {/* Content */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {viewMode === 'list' ? (
          // Floating sidebar panel — sits on top of dot-grid, doesn't cover full page
          <div
            className="floating-panel"
            style={{
              position: 'absolute',
              top: '64px',
              left: '16px',
              width: '300px',
              maxHeight: 'calc(100vh - 88px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: '12px',
              zIndex: 5,
            }}
          >
            {/* File tree */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '6px 0' }}>
              {tree && <FileNode node={tree} depth={0} activeRoles={activeRoles} />}
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
