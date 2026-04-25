import { useEffect, useState } from 'react'
import axios from 'axios'
import { Loader2, Play, ChevronRight, ChevronDown, Clock, ArrowRight } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { TraceEvent, TraceSummary } from '../types'

const EVENT_COLOR = { call: '#6366f1', return: '#10b981', error: '#ef4444' }

function TraceRow({ event, index }: { event: TraceEvent; index: number }) {
  const [open, setOpen] = useState(false)
  const isCall = event.event === 'call'
  const color = EVENT_COLOR[event.event] || '#7d8590'
  const indent = Math.min((event.depth - 1) * 16, 200)

  return (
    <div>
      <div
        className="flex items-center gap-2 py-0.5 px-2 hover:bg-[#161b22] cursor-pointer text-xs"
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ color }} className="font-mono text-[10px] w-4 shrink-0">
          {isCall ? '→' : '←'}
        </span>
        <span className="font-medium" style={{ color: isCall ? '#e6edf3' : '#7d8590' }}>
          {event.function}
        </span>
        <span className="text-[#7d8590] text-[10px]">{event.module}</span>
        {event.elapsed_ms !== undefined && (
          <span className="ml-auto text-[10px] text-[#7d8590] flex items-center gap-0.5">
            <Clock size={9} />{event.elapsed_ms}ms
          </span>
        )}
      </div>
      {open && (
        <div className="px-4 py-1 text-[10px] text-[#7d8590] bg-[#0d1117]"
             style={{ paddingLeft: `${indent + 24}px` }}>
          <div>📄 {event.file?.split('/').slice(-2).join('/')}</div>
          <div>📍 line {event.line} · depth {event.depth}</div>
        </div>
      )}
    </div>
  )
}

export default function ExecutionDebugger() {
  const { projectPath } = useStore()
  const [traces, setTraces] = useState<TraceSummary[]>([])
  const [selectedTrace, setSelectedTrace] = useState<TraceEvent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

  // New trace form
  const [moduleFile, setModuleFile] = useState('')
  const [funcName, setFuncName] = useState('')
  const [argsJson, setArgsJson] = useState('[]')
  const [label, setLabel] = useState('')
  const [traceError, setTraceError] = useState('')

  useEffect(() => {
    axios.get('/api/traces', { params: { path: projectPath } })
      .then(r => setTraces(r.data.traces || []))
  }, [projectPath])

  async function loadTrace(id: number) {
    setLoading(true)
    try {
      const { data } = await axios.get(`/api/trace/${id}`, { params: { path: projectPath } })
      setSelectedTrace(data.trace_data || [])
    } finally {
      setLoading(false)
    }
  }

  async function runTrace(e: React.FormEvent) {
    e.preventDefault()
    setRunning(true)
    setTraceError('')
    try {
      const args = JSON.parse(argsJson)
      const { data } = await axios.post('/api/trace', {
        path: projectPath,
        module_file: moduleFile,
        function_name: funcName,
        args,
        label: label || undefined,
      })
      if (!data.ok) { setTraceError(data.stderr || 'Trace failed'); return }
      setSelectedTrace(data.trace)
      // Refresh trace list
      const r2 = await axios.get('/api/traces', { params: { path: projectPath } })
      setTraces(r2.data.traces || [])
    } catch (err: any) {
      setTraceError(err.response?.data?.detail || err.message)
    } finally {
      setRunning(false)
    }
  }

  const callEvents = selectedTrace?.filter(e => e.event === 'call') || []

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <aside className="w-72 shrink-0 border-r border-[#21262d] flex flex-col overflow-hidden">
        {/* Run new trace */}
        <div className="p-3 border-b border-[#21262d]">
          <p className="text-[10px] uppercase tracking-wider text-[#7d8590] mb-2">New Trace</p>
          <form onSubmit={runTrace} className="flex flex-col gap-1.5">
            <input className="input-sm" placeholder="module/file.py (relative)" value={moduleFile}
                   onChange={e => setModuleFile(e.target.value)} />
            <input className="input-sm" placeholder="function_name" value={funcName}
                   onChange={e => setFuncName(e.target.value)} />
            <input className="input-sm" placeholder='args JSON e.g. ["hello"]' value={argsJson}
                   onChange={e => setArgsJson(e.target.value)} />
            <input className="input-sm" placeholder="label (optional)" value={label}
                   onChange={e => setLabel(e.target.value)} />
            <button type="submit" disabled={running || !moduleFile || !funcName}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#6366f1]
                         hover:bg-[#4f46e5] disabled:opacity-40 rounded text-xs font-medium">
              {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {running ? 'Tracing…' : 'Run Trace'}
            </button>
            {traceError && <p className="text-red-400 text-[10px] break-all">{traceError}</p>}
          </form>
        </div>

        {/* Saved traces */}
        <div className="flex-1 overflow-y-auto p-2">
          <p className="text-[10px] uppercase tracking-wider text-[#7d8590] px-1 mb-2">
            Saved Traces ({traces.length})
          </p>
          {traces.map(t => (
            <button key={t.id} onClick={() => loadTrace(t.id)}
              className="w-full text-left px-2 py-2 rounded hover:bg-[#21262d] mb-1">
              <div className="text-xs font-medium text-[#e6edf3] truncate">{t.label}</div>
              <div className="text-[10px] text-[#7d8590] truncate">{t.entry_point}</div>
              <div className="text-[10px] text-[#484f58]">{t.created_at}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Right panel — trace viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[#7d8590]">
            <Loader2 size={18} className="animate-spin mr-2" /> Loading trace…
          </div>
        ) : !selectedTrace ? (
          <div className="flex flex-col items-center justify-center h-full text-[#7d8590] gap-2">
            <span className="text-3xl">🔍</span>
            <p>Run a trace or select a saved one to see the execution order</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-[#21262d] bg-[#161b22] shrink-0 flex items-center gap-3">
              <span className="text-xs text-[#7d8590]">
                {callEvents.length} function calls
              </span>
              <div className="ml-auto flex items-center gap-3 text-[10px]">
                {Object.entries(EVENT_COLOR).map(([k, c]) => (
                  <span key={k} className="flex items-center gap-1" style={{ color: c }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                    {k}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono py-2">
              {selectedTrace.map((e, i) => <TraceRow key={i} event={e} index={i} />)}
            </div>
          </>
        )}
      </div>

      <style>{`
        .input-sm {
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 11px;
          color: #e6edf3;
          width: 100%;
          outline: none;
        }
        .input-sm:focus { border-color: #6366f1; }
        .input-sm::placeholder { color: #484f58; }
      `}</style>
    </div>
  )
}
