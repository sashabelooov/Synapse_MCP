import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import axios from 'axios'
import { Loader2, Play, Square, RotateCcw, Clock, AlertTriangle } from 'lucide-react'
import Prism from 'prismjs'
import 'prismjs/components/prism-python'

// VSCode Dark+ Python color theme for Prism
const PRISM_CSS = `
.sy-prism { color: #d4d4d4; }
.sy-prism .token.keyword        { color: #569cd6; }
.sy-prism .token.builtin        { color: #4ec9b0; }
.sy-prism .token.string         { color: #ce9178; }
.sy-prism .token.comment        { color: #6a9955; font-style: italic; }
.sy-prism .token.number         { color: #b5cea8; }
.sy-prism .token.function       { color: #dcdcaa; }
.sy-prism .token.class-name     { color: #4ec9b0; }
.sy-prism .token.operator       { color: #d4d4d4; }
.sy-prism .token.punctuation    { color: #d4d4d4; }
.sy-prism .token.boolean        { color: #569cd6; }
.sy-prism .token.decorator      { color: #c586c0; }
.sy-prism .token.decorator .token.function { color: #c586c0; }
.sy-prism .token.triple-quoted-string { color: #ce9178; }
`

// ── Types ─────────────────────────────────────────────────────────────────────
interface TraceEvent {
  event: 'call' | 'line' | 'return' | 'error'
  line: number
  name: string
  elapsed_ms: number
  error?: string
  traceback?: string
}

// ── Default starter code ──────────────────────────────────────────────────────
const DEFAULT_CODE = `def greet(name):
    message = "Hello, " + name
    return message

def add(a, b):
    result = a + b
    return result

# Run some code
name = "World"
greeting = greet(name)
total = add(10, 32)
print(greeting)
print("Sum:", total)
`

// ── Animation speed options ───────────────────────────────────────────────────
const SPEEDS = [
  { label: '0.5×', ms: 600 },
  { label: '1×',   ms: 300 },
  { label: '2×',   ms: 150 },
  { label: '4×',   ms: 60  },
]

const FONT = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace"
const FONT_SIZE = 13
const LINE_H = 22
const PAD = '12px 16px'

// ── Code editor with highlighted lines ───────────────────────────────────────
function CodeEditor({
  code, onChange, activeLines, executedSet, disabled,
}: {
  code: string
  onChange: (c: string) => void
  activeLines: Set<number>
  executedSet: Set<number>
  disabled: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineHighlightRef = useRef<HTMLDivElement>(null)
  const prismRef = useRef<HTMLPreElement>(null)

  const lines = code.split('\n')

  // Inject Prism CSS once
  useEffect(() => {
    if (!document.getElementById('sy-prism-css')) {
      const s = document.createElement('style')
      s.id = 'sy-prism-css'
      s.textContent = PRISM_CSS
      document.head.appendChild(s)
    }
  }, [])

  const highlighted = useMemo(
    () => Prism.highlight(code, Prism.languages.python, 'python'),
    [code]
  )

  const syncScroll = () => {
    const top = textareaRef.current?.scrollTop ?? 0
    if (lineHighlightRef.current) lineHighlightRef.current.scrollTop = top
    if (prismRef.current) prismRef.current.scrollTop = top
  }

  const shared: React.CSSProperties = {
    position: 'absolute', inset: 0, margin: 0,
    padding: PAD,
    fontFamily: FONT, fontSize: FONT_SIZE, lineHeight: `${LINE_H}px`,
    whiteSpace: 'pre', overflow: 'hidden',
    tabSize: 4,
  }

  return (
    <div style={{
      flex: 1, display: 'flex', overflow: 'hidden',
      fontFamily: FONT, fontSize: FONT_SIZE, lineHeight: `${LINE_H}px`,
    }}>
      {/* Line numbers */}
      <div style={{
        width: 48, flexShrink: 0, paddingTop: 12,
        background: 'var(--bg)', borderRight: '1px solid var(--border)',
        overflowY: 'hidden', userSelect: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        paddingRight: 10,
      }}>
        {lines.map((_, i) => {
          const lineNo = i + 1
          const isActive = activeLines.has(lineNo)
          const wasExecuted = executedSet.has(lineNo)
          return (
            <div key={i} style={{
              height: LINE_H, lineHeight: `${LINE_H}px`, fontSize: 11,
              color: isActive ? '#facc15' : wasExecuted ? '#f59e0b88' : 'var(--text-faint)',
              fontWeight: isActive ? 700 : 400,
              transition: 'color 0.1s',
            }}>
              {lineNo}
            </div>
          )
        })}
      </div>

      {/* Editor area — 3 layers */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Layer 1: yellow line highlights */}
        <div ref={lineHighlightRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', paddingTop: 12 }}>
          {lines.map((_, i) => {
            const lineNo = i + 1
            const isActive = activeLines.has(lineNo)
            const wasExecuted = executedSet.has(lineNo)
            return (
              <div key={i} style={{
                height: LINE_H,
                background: isActive ? 'rgba(250,204,21,0.22)' : wasExecuted ? 'rgba(250,204,21,0.07)' : 'transparent',
                borderLeft: isActive ? '3px solid #facc15' : wasExecuted ? '3px solid #f59e0b44' : '3px solid transparent',
                transition: 'background 0.12s, border-color 0.12s',
              }} />
            )
          })}
        </div>

        {/* Layer 2: Prism syntax colors */}
        <pre
          ref={prismRef}
          className="sy-prism"
          aria-hidden
          style={{ ...shared, background: 'transparent', pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
        />

        {/* Layer 3: transparent textarea (captures input, shows caret) */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={e => onChange(e.target.value)}
          onScroll={syncScroll}
          disabled={disabled}
          spellCheck={false}
          style={{
            ...shared,
            overflow: 'auto',
            background: 'transparent',
            border: 'none', outline: 'none', resize: 'none',
            color: 'transparent',
            caretColor: '#facc15',
            opacity: disabled ? 0.7 : 1,
          }}
        />
      </div>
    </div>
  )
}

// ── Trace step list ───────────────────────────────────────────────────────────
function TracePanel({ events, currentStep }: { events: TraceEvent[]; currentStep: number }) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      const active = listRef.current.querySelector('[data-active="true"]')
      active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentStep])

  const visibleEvents = events.slice(0, currentStep + 1)

  return (
    <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {visibleEvents.map((e, i) => {
        const isActive = i === currentStep
        const isError = e.event === 'error'
        const color = isError ? '#ef4444' : e.event === 'return' ? '#10b981' : e.event === 'call' ? '#818cf8' : '#64748b'
        return (
          <div
            key={i}
            data-active={isActive}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 14px',
              background: isActive ? 'rgba(250,204,21,0.1)' : 'transparent',
              borderLeft: isActive ? '3px solid #facc15' : '3px solid transparent',
              transition: 'background 0.1s',
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, color, width: 42, flexShrink: 0, letterSpacing: '0.04em' }}>
              {e.event.toUpperCase()}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text)', fontWeight: isActive ? 600 : 400 }}>
              {e.name}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
              L{e.line}
            </span>
            {e.elapsed_ms > 0 && (
              <span style={{ fontSize: 9, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <Clock size={8} />{e.elapsed_ms}ms
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ExecutionDebugger() {
  const [code, setCode] = useState(DEFAULT_CODE)
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [running, setRunning] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [speedIdx, setSpeedIdx] = useState(1)
  const [error, setError] = useState('')
  const [stderr, setStderr] = useState('')
  const [stdout, setStdout] = useState('')
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Derived: which lines are active (current step) and which have been visited
  const activeLines = new Set<number>()
  const executedSet = new Set<number>()
  const highlightedLines = new Map<number, number>()

  for (let i = 0; i <= currentStep && i < events.length; i++) {
    const e = events[i]
    if (e.line > 0) {
      executedSet.add(e.line)
      highlightedLines.set(e.line, i)
    }
  }
  if (currentStep >= 0 && currentStep < events.length && events[currentStep].line > 0) {
    activeLines.add(events[currentStep].line)
  }

  const stopAnimation = useCallback(() => {
    if (animRef.current) clearTimeout(animRef.current)
    setAnimating(false)
  }, [])

  const startAnimation = useCallback((evts: TraceEvent[]) => {
    setAnimating(true)
    setCurrentStep(-1)
    let step = 0
    const speed = SPEEDS[speedIdx].ms

    function tick() {
      setCurrentStep(step)
      step++
      if (step < evts.length) {
        animRef.current = setTimeout(tick, speed)
      } else {
        setAnimating(false)
      }
    }
    animRef.current = setTimeout(tick, 100)
  }, [speedIdx])

  useEffect(() => () => { if (animRef.current) clearTimeout(animRef.current) }, [])

  async function runCode() {
    stopAnimation()
    setRunning(true)
    setError('')
    setStderr('')
    setStdout('')
    setEvents([])
    setCurrentStep(-1)

    try {
      const { data } = await axios.post('/api/run-code', { code })
      if (!data.ok) { setError(data.error || 'Execution failed'); return }
      setEvents(data.events || [])
      setStdout(data.stdout || '')
      setStderr(data.stderr || '')
      // Start animation after brief pause
      setTimeout(() => startAnimation(data.events || []), 200)
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setRunning(false)
    }
  }

  function reset() {
    stopAnimation()
    setEvents([])
    setCurrentStep(-1)
    setError('')
    setStderr('')
    setStdout('')
  }

  const totalLines = events.filter(e => e.event === 'line').length
  const errorEvent = events.find(e => e.event === 'error')
  const isFinished = !animating && events.length > 0 && currentStep >= events.length - 1

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Left: Editor ── */}
      <div style={{
        flex: '0 0 60%', display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)',
      }}>
        {/* Editor toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            PYTHON
          </span>
          <div style={{ flex: 1 }} />

          {/* Speed selector */}
          <div style={{ display: 'flex', gap: 2 }}>
            {SPEEDS.map((s, i) => (
              <button key={i} onClick={() => setSpeedIdx(i)} style={{
                padding: '2px 7px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: speedIdx === i ? 'var(--accent)' : 'var(--bg-input)',
                color: speedIdx === i ? '#fff' : 'var(--text-muted)',
              }}>{s.label}</button>
            ))}
          </div>

          {/* Run / Stop / Reset */}
          {animating ? (
            <button onClick={stopAnimation} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 14px', borderRadius: 7, border: 'none',
              background: '#ef4444', color: '#fff',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              <Square size={11} fill="#fff" /> Stop
            </button>
          ) : (
            <button onClick={runCode} disabled={running || !code.trim()} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 14px', borderRadius: 7, border: 'none',
              background: running ? 'var(--bg-input)' : '#22c55e',
              color: running ? 'var(--text-muted)' : '#fff',
              fontSize: 12, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer',
              opacity: running ? 0.7 : 1,
            }}>
              {running
                ? <><Loader2 size={11} className="animate-spin" /> Running…</>
                : <><Play size={11} fill="#fff" /> Run Trace</>
              }
            </button>
          )}

          {events.length > 0 && (
            <button onClick={reset} title="Clear" style={{
              padding: '5px 8px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--bg-input)',
              color: 'var(--text-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}>
              <RotateCcw size={12} />
            </button>
          )}
        </div>

        {/* Code editor */}
        <CodeEditor
          code={code}
          onChange={c => { setCode(c); reset() }}

          activeLines={activeLines}
          executedSet={executedSet}
          disabled={running || animating}
        />

        {/* Error / stderr bar */}
        {(error || errorEvent) && (
          <div style={{
            padding: '8px 14px', flexShrink: 0,
            borderTop: '1px solid #ef444440',
            background: '#ef444410',
            display: 'flex', alignItems: 'flex-start', gap: 7,
          }}>
            <AlertTriangle size={13} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
            <pre style={{ fontSize: 11, color: '#ef4444', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              {error || errorEvent?.error}
            </pre>
          </div>
        )}
        {stdout && (
          <div style={{
            padding: '6px 14px', flexShrink: 0,
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-panel)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2, letterSpacing: '0.05em' }}>OUTPUT</div>
            <pre style={{ fontSize: 11, color: '#a3e635', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{stdout}</pre>
          </div>
        )}
        {stderr && !error && !errorEvent && (
          <div style={{
            padding: '6px 14px', flexShrink: 0,
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-panel)',
          }}>
            <pre style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-wrap' }}>{stderr}</pre>
          </div>
        )}
      </div>

      {/* ── Right: Trace panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Panel header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            EXECUTION TRACE
          </span>
          {events.length > 0 && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 99,
              background: animating ? 'rgba(250,204,21,0.15)' : isFinished ? 'rgba(34,197,94,0.15)' : 'var(--bg-input)',
              color: animating ? '#facc15' : isFinished ? '#22c55e' : 'var(--text-muted)',
              border: `1px solid ${animating ? '#facc1540' : isFinished ? '#22c55e40' : 'var(--border)'}`,
            }}>
              {animating ? `step ${currentStep + 1} / ${events.length}` : isFinished ? `✓ ${totalLines} lines executed` : ''}
            </span>
          )}
        </div>

        {events.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 12, color: 'var(--text-muted)',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Play size={20} style={{ color: 'var(--text-faint)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Write code and click Run Trace</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                Each executed line will be highlighted in yellow
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Legend */}
            <div style={{
              padding: '6px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', gap: 14, flexShrink: 0,
            }}>
              {[
                { color: '#818cf8', label: 'call' },
                { color: '#64748b', label: 'line' },
                { color: '#10b981', label: 'return' },
                { color: '#ef4444', label: 'error' },
              ].map(({ color, label }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                  {label}
                </span>
              ))}
            </div>
            <TracePanel events={events} currentStep={currentStep} />
          </>
        )}
      </div>
    </div>
  )
}
