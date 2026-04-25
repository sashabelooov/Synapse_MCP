import { useState } from 'react'
import axios from 'axios'
import {
  FolderTree, GitGraph, Database, Route, Container, Bug,
  Loader2, AlertCircle, Zap, Sun, Moon, Play,
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

const SIDEBAR_W = 208

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
  const [sideOpen, setSideOpen] = useState(true)

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
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const ready = !!projectPath

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', color: 'var(--text)', position: 'relative' }}
         className="dot-grid">

      {/* ── Sidebar ── */}
      <aside style={{
        width: sideOpen ? `${SIDEBAR_W}px` : '0px',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        background: 'var(--sidebar)',
        borderRight: sideOpen ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 10,
      }}>
        <div style={{ width: `${SIDEBAR_W}px`, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Logo row */}
          <div style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{
              width: 24, height: 24,
              borderRadius: 7,
              background: '#6366f1',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Zap size={13} color="#fff" />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              Synapse
            </span>
            <span style={{
              fontSize: 9, padding: '1px 6px',
              borderRadius: 99,
              background: 'rgba(99,102,241,0.15)',
              color: '#818cf8',
              marginLeft: 2,
            }}>Alpha</span>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: '8px 8px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {TABS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id
              return (
                <button
                  key={id}
                  onClick={() => ready && setActiveTab(id as any)}
                  disabled={!ready}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: isActive ? 'var(--nav-active)' : 'transparent',
                    color: isActive ? '#818cf8' : 'var(--text-muted)',
                    cursor: ready ? 'pointer' : 'not-allowed',
                    opacity: ready ? 1 : 0.35,
                    fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    width: '100%',
                    whiteSpace: 'nowrap',
                    textAlign: 'left',
                    transition: 'background 0.12s, color 0.12s',
                  }}
                  onMouseEnter={e => { if (!isActive && ready) e.currentTarget.style.background = 'var(--nav-hover)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <Icon size={15} style={{ flexShrink: 0 }} />
                  {label}
                </button>
              )
            })}
          </nav>

          {/* Stats */}
          {ready && analysisStats && (
            <div style={{
              margin: '8px',
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              fontSize: 11,
            }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
                {framework || 'Project'}
              </div>
              {([
                ['Files', analysisStats.files],
                ['Functions', analysisStats.functions],
                ['Routes', analysisStats.routes],
                ['DB Models', analysisStats.db_models],
                ['DevOps', analysisStats.devops_files],
              ] as [string, number][]).map(([lbl, val]) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{lbl}</span>
                  <span style={{ color: '#818cf8', fontWeight: 500 }}>{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── Half-circle drawer handle ── */}
      <button
        onClick={() => setSideOpen(o => !o)}
        title={sideOpen ? 'Close sidebar' : 'Open sidebar'}
        style={{
          position: 'fixed',
          left: sideOpen ? `${SIDEBAR_W}px` : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 50,
          width: 18,
          height: 52,
          borderRadius: '0 26px 26px 0',
          border: '1px solid var(--border)',
          borderLeft: 'none',
          background: 'var(--bg-card)',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          padding: 0,
          transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: '2px 0 8px rgba(0,0,0,0.12)',
        }}
      >
        {/* 3-line hamburger */}
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            display: 'block',
            width: 8,
            height: 1.5,
            borderRadius: 2,
            background: 'var(--text-muted)',
          }} />
        ))}
      </button>

      {/* ── Main column ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Topbar */}
        <header style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--topbar)',
          backdropFilter: 'blur(20px)',
          flexShrink: 0,
        }}>
          <input
            className="syn-input"
            style={{ flex: 1, maxWidth: 540, borderRadius: 8, padding: '6px 12px', fontSize: 13 }}
            placeholder="/absolute/path/to/your/project"
            value={inputPath}
            onChange={e => setInputPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
          />
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#6366f1',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              opacity: isAnalyzing ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            {isAnalyzing
              ? <><Loader2 size={13} className="animate-spin" /> Analyzing…</>
              : <><Play size={13} /> Analyze</>}
          </button>

          {error && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#f87171', fontSize: 12 }}>
              <AlertCircle size={13} /> {error}
            </span>
          )}

          <div style={{ flex: 1 }} />

          <button
            onClick={toggleTheme}
            style={{
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {!ready ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: 16,
              color: 'var(--text-muted)',
            }}>
              <div style={{
                width: 56, height: 56,
                borderRadius: 16,
                background: 'rgba(99,102,241,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Zap size={26} color="#6366f1" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
                  Synapse MCP
                </p>
                <p style={{ fontSize: 13 }}>Enter a project path above and click Analyze</p>
                <p style={{ fontSize: 11, marginTop: 4, color: 'var(--text-faint)' }}>
                  FastAPI · Django · call graphs · DB schema · DevOps
                </p>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'tree'      && <ProjectTree />}
              {activeTab === 'callgraph' && <CallGraph />}
              {activeTab === 'dbschema'  && <DbSchema />}
              {activeTab === 'routes'    && <RoutesView />}
              {activeTab === 'devops'    && <DevopsView />}
              {activeTab === 'debugger'  && <ExecutionDebugger />}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
