import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Mic, Paperclip, Wrench, Save, Plus, FolderOpen, Trash2, X } from 'lucide-react'
import axios from 'axios'
import DiagramCanvas from '../arch/DiagramCanvas'
import type { DiagramData, DiagramMeta, ChatMessage } from '../arch/types'

/* ─── Shared style helpers ──────────────────────────────────────────────────── */

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, border: 'none', background: 'transparent',
  color: 'var(--text-muted)', borderRadius: 7, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.15s, color 0.15s', flexShrink: 0,
}
const toolsBtn: React.CSSProperties = {
  ...iconBtn, width: 'auto', padding: '0 9px', fontSize: 11,
  fontFamily: 'inherit', fontWeight: 500, gap: 5,
}
function hov(e: React.MouseEvent) {
  const el = e.currentTarget as HTMLElement
  el.style.background = 'var(--nav-hover)'; el.style.color = 'var(--text)'
}
function hout(e: React.MouseEvent) {
  const el = e.currentTarget as HTMLElement
  el.style.background = 'transparent'; el.style.color = 'var(--text-muted)'
}

/* ─── Diagrams list panel ───────────────────────────────────────────────────── */

interface DiagramsListProps {
  diagrams: DiagramMeta[]
  currentId?: string
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function DiagramsList({ diagrams, currentId, onLoad, onDelete, onClose }: DiagramsListProps) {
  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 250,
      width: 280,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(20px)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.02em' }}>Saved Diagrams</span>
        <button onClick={onClose} style={{ ...iconBtn, width: 22, height: 22 }}
          onMouseOver={hov} onMouseOut={hout}><X size={13} /></button>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {diagrams.length === 0 && (
          <div style={{ padding: '20px 14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            No saved diagrams yet
          </div>
        )}
        {diagrams.map(d => (
          <div key={d.id} style={{
            display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 8,
            borderBottom: '1px solid var(--border)',
            background: currentId === d.id ? 'rgba(88,166,255,0.06)' : 'transparent',
            transition: 'background 0.12s',
            cursor: 'pointer',
          }}
            onClick={() => onLoad(d.id)}
            onMouseOver={e => { if (currentId !== d.id) (e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)' }}
            onMouseOut={e => { if (currentId !== d.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(d.updatedAt).toLocaleDateString()}</div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(d.id) }}
              style={{ ...iconBtn, width: 24, height: 24, flexShrink: 0 }}
              onMouseOver={e => { const b = e.currentTarget as HTMLElement; b.style.background = 'rgba(255,77,106,0.15)'; b.style.color = '#ff4d6a' }}
              onMouseOut={e => { const b = e.currentTarget as HTMLElement; b.style.background = 'transparent'; b.style.color = 'var(--text-muted)' }}
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Chat Panel ──────────────────────────────────────────────────────────────── */

interface ChatPanelProps {
  onClose: () => void
  onDiagram: (d: DiagramData) => void
  projectPath: string
  model: 'claude' | 'claude-cli' | 'openai'
}

function ChatPanel({ onClose, onDiagram, projectPath, model }: ChatPanelProps) {
  const [pos, setPos] = useState({ x: 60, y: 10 })
  const [width, setWidth] = useState(Math.max(300, Math.round(window.innerWidth * 0.28)))
  const panelRef = useRef<HTMLDivElement>(null)
  const dragBar = useRef<{ active: boolean; ox: number; oy: number }>({ active: false, ox: 0, oy: 0 })
  const resizeBar = useRef<{ active: boolean; sx: number; sw: number }>({ active: false, sx: 0, sw: 0 })

  const [msgs, setMsgs] = useState<{ role: 'user' | 'ai'; text: string }[]>([])
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  /* drag */
  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragBar.current = { active: true, ox: e.clientX - pos.x, oy: e.clientY - pos.y }
    e.preventDefault()
  }, [pos])

  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (!dragBar.current.active) return
      const p = panelRef.current
      if (!p) return
      setPos({
        x: Math.max(0, Math.min(e.clientX - dragBar.current.ox, window.innerWidth - p.offsetWidth - 4)),
        y: Math.max(0, Math.min(e.clientY - dragBar.current.oy, window.innerHeight - p.offsetHeight - 4)),
      })
    }
    const up = () => { dragBar.current.active = false }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
  }, [])

  /* resize */
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    resizeBar.current = { active: true, sx: e.clientX, sw: width }
    e.preventDefault(); e.stopPropagation()
  }, [width])

  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (!resizeBar.current.active) return
      setWidth(Math.max(260, Math.min(resizeBar.current.sw + (e.clientX - resizeBar.current.sx), window.innerWidth * 0.65)))
    }
    const up = () => { resizeBar.current.active = false }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }
  }, [])

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  async function send() {
    const t = input.trim()
    if (!t || loading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    const userMsg: ChatMessage = { role: 'user', content: t }
    const newHistory = [...history, userMsg]
    setHistory(newHistory)
    setMsgs(m => [...m, { role: 'user', text: t }])
    setLoading(true)
    try {
      const { data } = await axios.post('/api/architect/chat', {
        messages: newHistory,
        model,
        projectPath: projectPath || undefined,
      })
      if (data.ok) {
        const aiMsg: ChatMessage = { role: 'assistant', content: data.message }
        setHistory(h => [...h, aiMsg])
        setMsgs(m => [...m, { role: 'ai', text: data.message }])
        if (data.diagram) {
          onDiagram({ ...data.diagram, projectPath: projectPath || undefined })
        }
      } else {
        setMsgs(m => [...m, { role: 'ai', text: `Error: ${data.error}` }])
      }
    } catch (e: any) {
      setMsgs(m => [...m, { role: 'ai', text: `Failed to reach AI: ${e.message}` }])
    }
    setLoading(false)
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const panelH = `calc(100vh - ${pos.y + 16}px)`

  return (
    <div
      ref={panelRef}
      className="chat-panel-root"
      style={{
        position: 'fixed', left: pos.x, top: pos.y,
        width, height: panelH, maxHeight: 'calc(100vh - 32px)',
        zIndex: 200, display: 'flex', flexDirection: 'column',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
        backdropFilter: 'blur(20px)', overflow: 'hidden', userSelect: 'none',
      }}
    >
      {/* drag bar */}
      <div
        onMouseDown={onDragStart}
        style={{
          height: 38, display: 'flex', alignItems: 'center',
          padding: '0 10px 0 12px', cursor: 'grab', flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-faint)' }} />
          ))}
        </div>
        <span style={{ flex: 1, paddingLeft: 10, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          AI Chat
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
            background: model === 'claude' ? 'rgba(245,166,35,0.15)' : model === 'claude-cli' ? 'rgba(204,120,92,0.15)' : 'rgba(16,163,127,0.15)',
            color: model === 'claude' ? '#f5a623' : model === 'claude-cli' ? '#cc785c' : '#10a37f',
            letterSpacing: '0.02em',
          }}>
            {model === 'claude' ? 'Claude API' : model === 'claude-cli' ? 'Claude CLI' : 'GPT-4o'}
          </span>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onClose}
            style={{ width: 22, height: 22, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, transition: 'all 0.12s' }}
            onMouseOver={e => { const b = e.currentTarget as HTMLElement; b.style.background = 'var(--nav-hover)'; b.style.color = 'var(--text)' }}
            onMouseOut={e => { const b = e.currentTarget as HTMLElement; b.style.background = 'var(--bg-input)'; b.style.color = 'var(--text-muted)' }}
            title="Close"
          >×</button>
        </div>
      </div>

      {/* messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, opacity: 0.5 }}>
            <div style={{ fontSize: 28 }}>✦</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              Describe your system and I'll<br />draw the architecture for you
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              padding: '8px 11px', lineHeight: 1.6, fontSize: 12.5,
              maxWidth: '92%', whiteSpace: 'pre-wrap',
              ...(m.role === 'ai'
                ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '3px 9px 9px 9px' }
                : { background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.18)', color: '#b8d4f5', borderRadius: '9px 3px 9px 9px' }
              ),
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '3px 9px 9px 9px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--text-muted)',
                    animation: `pulse 1.2s ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div style={{ padding: '8px 10px 10px', borderTop: msgs.length ? '1px solid var(--border)' : 'none', flexShrink: 0 }}>
        <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 11, padding: '8px 8px 6px', transition: 'border-color 0.15s' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); autoResize() }}
            onKeyDown={onKey}
            rows={1}
            placeholder="Describe your system architecture…"
            disabled={loading}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55,
              resize: 'none', minHeight: 32, maxHeight: 140, padding: '2px 4px',
              opacity: loading ? 0.5 : 1,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, paddingTop: 4 }}>
            <button title="Attach" style={iconBtn} onMouseOver={hov} onMouseOut={hout}><Paperclip size={13} /></button>
            <button style={toolsBtn} onMouseOver={hov} onMouseOut={hout}><Wrench size={11} />Tools</button>
            <button title="Voice" style={iconBtn} onMouseOver={hov} onMouseOut={hout}><Mic size={12} /></button>
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              style={{
                width: 28, height: 28, border: 'none', marginLeft: 'auto',
                background: input.trim() && !loading ? 'var(--accent)' : 'var(--bg-card)',
                color: input.trim() && !loading ? '#0b121e' : 'var(--text-faint)',
                borderRadius: 7, cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: input.trim() && !loading ? '0 0 12px rgba(88,166,255,0.2)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* resize handle */}
      <div onMouseDown={onResizeStart} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, cursor: 'ew-resize', zIndex: 10 }} />
    </div>
  )
}

/* ─── Main ArchitectWorkspace ──────────────────────────────────────────────── */

export default function ArchitectWorkspace() {
  const [chatOpen, setChatOpen] = useState(false)
  const [diagram, setDiagram] = useState<DiagramData | null>(null)
  const [diagrams, setDiagrams] = useState<DiagramMeta[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [model, setModel] = useState<'claude' | 'claude-cli' | 'openai'>('claude')
  const [projectPath, setProjectPath] = useState('')
  const [pathOpen, setPathOpen] = useState(false)
  const pathInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    axios.get('/api/architect/diagrams').then(r => {
      if (r.data.ok) setDiagrams(r.data.diagrams)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (pathOpen) pathInputRef.current?.focus()
  }, [pathOpen])

  async function saveDiagram() {
    if (!diagram) return
    setSaving(true)
    try {
      const { data } = await axios.post('/api/architect/diagrams', { diagram: { ...diagram, projectPath: projectPath || undefined } })
      if (data.ok) {
        setDiagram(d => d ? { ...d, id: data.id } : d)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        const r = await axios.get('/api/architect/diagrams')
        if (r.data.ok) setDiagrams(r.data.diagrams)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  async function loadDiagram(id: string) {
    try {
      const { data } = await axios.get(`/api/architect/diagrams/${id}`)
      if (data.ok) { setDiagram(data.diagram); setListOpen(false) }
    } catch { /* ignore */ }
  }

  async function deleteDiagram(id: string) {
    try {
      await axios.delete(`/api/architect/diagrams/${id}`)
      setDiagrams(d => d.filter(x => x.id !== id))
      if (diagram?.id === id) setDiagram(null)
    } catch { /* ignore */ }
  }

  /* toolbar button style */
  const tbBtn = (active = false): React.CSSProperties => ({
    height: 34, padding: '0 14px', border: '1px solid var(--border)',
    background: active ? 'rgba(88,166,255,0.1)' : 'var(--bg-panel)',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center',
    gap: 7, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
    transition: 'all 0.15s', backdropFilter: 'blur(10px)',
    letterSpacing: '0.01em', flexShrink: 0,
  })

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Always-on dot grid background ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(var(--dot-color) 1px, transparent 1px)',
        backgroundSize: 'var(--dot-size) var(--dot-size)',
      }} />

      {/* ── ReactFlow canvas (transparent bg so dot grid shows through) ── */}
      {diagram && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          <DiagramCanvas diagram={diagram} />
        </div>
      )}

      {/* ── Hamburger ── */}
      <button
        onClick={() => setChatOpen(o => !o)}
        title={chatOpen ? 'Hide chat' : 'Open AI chat'}
        style={{
          position: 'fixed', top: 16, left: 16, zIndex: 300,
          width: 38, height: 38,
          background: chatOpen ? 'var(--nav-active)' : 'var(--bg-panel)',
          border: '1px solid var(--border)', borderRadius: 9, cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 4.5, transition: 'all 0.15s',
        }}
        onMouseOver={e => { if (!chatOpen) (e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)' }}
        onMouseOut={e => { if (!chatOpen) (e.currentTarget as HTMLElement).style.background = 'var(--bg-panel)' }}
      >
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            display: 'block', width: 16, height: 1.5, borderRadius: 2,
            background: chatOpen ? 'var(--accent)' : 'var(--text-muted)',
            transition: 'background 0.15s',
          }} />
        ))}
      </button>

      {/* ── Top-right toolbar ── */}
      <div style={{
        position: 'fixed', top: 16, right: 16, zIndex: 300,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {/* Model toggle — cycles: claude → claude-cli → openai */}
        <button
          onClick={() => setModel(m => m === 'claude' ? 'claude-cli' : m === 'claude-cli' ? 'openai' : 'claude')}
          style={tbBtn()}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)' }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-panel)' }}
          title="Switch AI model (Claude API → Claude CLI → GPT-4o)"
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: model === 'claude' ? '#f5a623' : model === 'claude-cli' ? '#cc785c' : '#10a37f',
          }} />
          {model === 'claude' ? 'Claude API' : model === 'claude-cli' ? 'Claude CLI' : 'GPT-4o'}
        </button>

        {/* Path */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setPathOpen(o => !o)}
            style={tbBtn(pathOpen || !!projectPath)}
            onMouseOver={e => { if (!pathOpen && !projectPath) (e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)' }}
            onMouseOut={e => { if (!pathOpen && !projectPath) (e.currentTarget as HTMLElement).style.background = 'var(--bg-panel)' }}
            title="Set project path"
          >
            <FolderOpen size={13} />
            {projectPath ? projectPath.split('/').pop() : 'Path'}
          </button>
          {pathOpen && (
            <div style={{
              position: 'absolute', top: 42, right: 0, zIndex: 310,
              background: 'var(--bg-panel)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(20px)',
            }}>
              <input
                ref={pathInputRef}
                value={projectPath}
                onChange={e => setProjectPath(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setPathOpen(false) }}
                placeholder="/path/to/project"
                style={{
                  width: 240, background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 7, padding: '7px 10px', color: 'var(--text)',
                  fontSize: 12, fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
          )}
        </div>

        {/* New */}
        <button
          onClick={() => setDiagram(null)}
          style={tbBtn()}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)' }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-panel)' }}
          title="New diagram"
        >
          <Plus size={13} /> New
        </button>

        {/* Diagrams list */}
        <button
          onClick={() => setListOpen(o => !o)}
          style={tbBtn(listOpen)}
          onMouseOver={e => { if (!listOpen) (e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)' }}
          onMouseOut={e => { if (!listOpen) (e.currentTarget as HTMLElement).style.background = 'var(--bg-panel)' }}
          title="Saved diagrams"
        >
          <FolderOpen size={13} />
          Diagrams {diagrams.length > 0 && (
            <span style={{ background: 'var(--accent)', color: '#0b121e', borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '0 5px' }}>
              {diagrams.length}
            </span>
          )}
        </button>

        {/* Save */}
        {diagram && (
          <button
            onClick={saveDiagram}
            disabled={saving}
            style={{
              ...tbBtn(),
              color: saved ? '#3fb950' : 'var(--text-muted)',
              background: saved ? 'rgba(63,185,80,0.08)' : 'var(--bg-panel)',
              borderColor: saved ? 'rgba(63,185,80,0.3)' : 'var(--border)',
            }}
            onMouseOver={e => { if (!saving && !saved) (e.currentTarget as HTMLElement).style.background = 'var(--nav-hover)' }}
            onMouseOut={e => { if (!saving && !saved) (e.currentTarget as HTMLElement).style.background = 'var(--bg-panel)' }}
            title="Save diagram"
          >
            <Save size={13} /> {saved ? 'Saved!' : saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      {/* ── Chat panel ── */}
      {chatOpen && (
        <ChatPanel
          onClose={() => setChatOpen(false)}
          onDiagram={setDiagram}
          projectPath={projectPath}
          model={model}
        />
      )}

      {/* ── Diagrams list ── */}
      {listOpen && (
        <DiagramsList
          diagrams={diagrams}
          currentId={diagram?.id}
          onLoad={loadDiagram}
          onDelete={deleteDiagram}
          onClose={() => setListOpen(false)}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3 }
          40% { opacity: 1 }
        }
        .react-flow__controls button {
          background: var(--bg-panel) !important;
          border-color: var(--border) !important;
          color: var(--text-muted) !important;
        }
        .react-flow__controls button:hover {
          background: var(--nav-hover) !important;
          color: var(--text) !important;
        }
        .react-flow__controls svg { fill: currentColor !important; }
        .react-flow__handle { opacity: 0; transition: opacity 0.15s; }
        .react-flow__node:hover .react-flow__handle { opacity: 1; }
      `}</style>
    </div>
  )
}
