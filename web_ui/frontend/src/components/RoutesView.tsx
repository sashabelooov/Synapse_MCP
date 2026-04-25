import { useEffect, useState } from 'react'
import axios from 'axios'
import { Loader2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { Route } from '../types'

const METHOD_COLOR: Record<string, string> = {
  GET: '#10b981', POST: '#6366f1', PUT: '#f59e0b',
  PATCH: '#06b6d4', DELETE: '#ef4444', ANY: '#7d8590',
}

export default function RoutesView() {
  const { projectPath } = useStore()
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    axios.get('/api/routes', { params: { path: projectPath } })
      .then(r => setRoutes(r.data.routes || []))
      .finally(() => setLoading(false))
  }, [projectPath])

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="animate-spin mr-2" /> Loading routes…
    </div>
  )

  const filtered = routes.filter(r =>
    r.path?.toLowerCase().includes(filter.toLowerCase()) ||
    r.handler_name?.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-2 flex items-center gap-3 shrink-0"
           style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <input
          className="syn-input rounded px-2 py-1 text-xs w-64"
          placeholder="Filter by path or handler…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} routes
        </span>
        <div className="ml-auto flex gap-2">
          {Object.entries(METHOD_COLOR).map(([m, c]) => (
            <span key={m} className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{ background: `${c}22`, color: c }}>{m}</span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            <tr>
              {['Method', 'Path', 'Handler', 'File', 'Tags'].map(h => (
                <th key={h} className="text-left px-4 py-2 font-medium"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const color = METHOD_COLOR[r.method] || '#7d8590'
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td className="px-4 py-2">
                    <span className="font-mono px-1.5 py-0.5 rounded text-[10px]"
                          style={{ background: `${color}22`, color }}>
                      {r.method}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono" style={{ color: '#818cf8' }}>{r.path}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text)' }}>{r.handler_name || '—'}</td>
                  <td className="px-4 py-2 truncate max-w-[200px]"
                      style={{ color: 'var(--text-muted)' }}>{r.relative_path || '—'}</td>
                  <td className="px-4 py-2">
                    {(r.tags || []).map((t: string, j: number) => (
                      <span key={j} className="mr-1 px-1 py-0.5 rounded text-[10px]"
                            style={{ background: 'var(--nav-hover)', color: 'var(--text-muted)' }}>
                        {t}
                      </span>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
            No routes found. Make sure your project uses FastAPI routers or Django urls.py.
          </div>
        )}
      </div>
    </div>
  )
}
