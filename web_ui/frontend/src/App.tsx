import { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  FolderTree, GitGraph, Database, Route, Container, Bug,
  Loader2, AlertCircle, Zap, Sun, Moon, Play,
  LayoutGrid, HelpCircle, Settings,
} from 'lucide-react'
import { useStore } from './store/useStore'
import ProjectTree from './components/ProjectTree'
import CallGraph from './components/CallGraph'
import DbSchema from './components/DbSchema'
import RoutesView from './components/RoutesView'
import DevopsView from './components/DevopsView'
import ExecutionDebugger from './components/ExecutionDebugger'

const TABS = [
  { id: 'tree',      label: 'Project Tree', Icon: FolderTree },
  { id: 'callgraph', label: 'Call Graph',   Icon: GitGraph   },
  { id: 'dbschema',  label: 'DB Schema',    Icon: Database   },
  { id: 'routes',    label: 'Routes',       Icon: Route      },
  { id: 'devops',    label: 'DevOps',       Icon: Container  },
  { id: 'debugger',  label: 'Debugger',     Icon: Bug        },
] as const

export default function App() {
  const {
    projectPath, setProjectPath,
    activeTab, setActiveTab,
    isAnalyzing, setIsAnalyzing,
    analysisStats, setAnalysisStats,
    framework, setFramework,
    theme, toggleTheme,
  } = useStore()
  const [inputPath, setInputPath] = useState('')
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const panOrigin = useRef({ x: 0, y: 0 })
  const [cursor, setCursor] = useState<'default' | 'grab' | 'grabbing'>('grab')

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Pan handlers — block only on truly interactive elements
  const onCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    // Don't pan if clicking buttons, inputs, links, or the floating menu panel
    const blocked = target.closest('button, input, a, select, textarea, .floating-panel, [role="button"]')
    if (blocked) return
    isPanning.current = true
    panStart.current = { x: e.clientX, y: e.clientY }
    panOrigin.current = { ...pan }
    setCursor('grabbing')
    e.preventDefault()
  }, [pan])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isPanning.current) return
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy })
    }
    function onMouseUp() {
      if (!isPanning.current) return
      isPanning.current = false
      setCursor('grab')
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  async function handleAnalyze() {
    if (!inputPath.trim()) return
    setIsAnalyzing(true)
    setError('')
    setAnalysisStats(null)
    try {
      const { data } = await axios.post('/api/analyze', { path: inputPath.trim() })
      if (!data.ok) { setError(data.error || 'Analysis failed'); return }
      setProjectPath(inputPath.trim())
      setAnalysisStats(data.stats)
      setFramework(data.framework)
      setActiveTab('tree')
      setMenuOpen(false)
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const ready = !!projectPath

  return (
    <div
      className="workspace-root"
      style={{ cursor }}
      onMouseDown={onCanvasMouseDown}
    >
      {/* Dot grid — moves with pan */}
      <div
        className="dot-grid"
        style={{ backgroundPosition: `${pan.x}px ${pan.y}px` }}
      />

      {/* Menu button + floating panel — fixed, unaffected by pan */}
      <div ref={menuRef} style={{ position: 'fixed', top: 16, left: 16, zIndex: 50 }}>
        <button className="menu-btn" onClick={() => setMenuOpen(o => !o)} title="Menu">
          <span className="menu-line" />
          <span className="menu-line" />
          <span className="menu-line" />
        </button>

        {menuOpen && (
          <aside className="floating-panel">
            <div className="fp-header">
              <div className="logo-icon"><Zap size={13} color="#fff" /></div>
              <div>
                <div className="fp-title">Synapse</div>
                <div className="fp-subtitle">Code Intelligence</div>
              </div>
              <span className="logo-badge">Alpha</span>
            </div>

            <div className="fp-section">
              <input
                className="syn-input path-input"
                placeholder="/path/to/project"
                value={inputPath}
                onChange={e => setInputPath(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              />
              <button className="analyze-btn" onClick={handleAnalyze} disabled={isAnalyzing}>
                {isAnalyzing
                  ? <><Loader2 size={12} className="animate-spin" /> Analyzing…</>
                  : <><Play size={12} /> Analyze</>}
              </button>
              {error && <span className="error-msg"><AlertCircle size={11} /> {error}</span>}
            </div>

            <div className="fp-divider" />

            <nav className="fp-nav">
              {TABS.map(({ id, label, Icon }) => {
                const isActive = activeTab === id && ready
                return (
                  <button
                    key={id}
                    onClick={() => { if (ready) { setActiveTab(id as any); setMenuOpen(false) } }}
                    disabled={!ready}
                    className={`fp-item${isActive ? ' fp-item--active' : ''}${!ready ? ' fp-item--disabled' : ''}`}
                  >
                    <Icon size={16} style={{ flexShrink: 0 }} />
                    <span>{label}</span>
                  </button>
                )
              })}
            </nav>

            <div className="fp-divider" />

            {ready && analysisStats && (
              <>
                <div className="fp-nav" style={{ padding: '6px 0' }}>
                  <div className="fp-item" style={{ cursor: 'default' }}>
                    <LayoutGrid size={16} style={{ flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: 'var(--fp-title)' }}>{framework || 'Project'}</span>
                  </div>
                  {([
                    ['Files', analysisStats.files],
                    ['Functions', analysisStats.functions],
                    ['Routes', analysisStats.routes],
                  ] as [string, number][]).map(([lbl, val]) => (
                    <div key={lbl} className="fp-stat-row">
                      <span>{lbl}</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
                <div className="fp-divider" />
              </>
            )}

            <nav className="fp-nav">
              <button className="fp-item" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </button>
              <button className="fp-item">
                <Settings size={16} />
                <span>Settings</span>
              </button>
              <button className="fp-item">
                <HelpCircle size={16} />
                <span>Help</span>
              </button>
            </nav>
          </aside>
        )}
      </div>

      {/* Canvas content — fixed, does NOT move with pan (each view has its own pan) */}
      <div className="workspace-content">
        {ready && (
          <>
            {activeTab === 'tree'      && <ProjectTree />}
            {activeTab === 'callgraph' && <CallGraph />}
            {activeTab === 'dbschema'  && <DbSchema />}
            {activeTab === 'routes'    && <RoutesView />}
            {activeTab === 'devops'    && <DevopsView />}
            {activeTab === 'debugger'  && <ExecutionDebugger />}
          </>
        )}
      </div>
    </div>
  )
}
