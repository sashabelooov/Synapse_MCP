import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import axios from 'axios'
import { Loader2, Play, Pause, RotateCcw, AlertTriangle, SkipBack, SkipForward, ChevronLeft, ChevronRight } from 'lucide-react'
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
`

// ── Types ─────────────────────────────────────────────────────────────────────
interface TraceEvent {
  event: 'call' | 'line' | 'return' | 'error'
  line: number
  name: string
  elapsed_ms: number
  locals?: Record<string, string>
  error?: string
  traceback?: string
}

interface FrameState {
  name: string
  locals: Record<string, string>
}

// Build call-stack snapshot at every step
function buildStacks(events: TraceEvent[]): FrameState[][] {
  const result: FrameState[][] = []
  const stack: FrameState[] = []

  for (const ev of events) {
    if (ev.event === 'call') {
      stack.push({ name: ev.name, locals: { ...ev.locals } })
    } else if (ev.event === 'line' && stack.length > 0) {
      stack[stack.length - 1].locals = { ...ev.locals }
    } else if (ev.event === 'return' && stack.length > 0) {
      stack[stack.length - 1].locals = { ...ev.locals }
      result.push(stack.map(f => ({ ...f, locals: { ...f.locals } })))
      stack.pop()
      continue
    }
    result.push(stack.map(f => ({ ...f, locals: { ...f.locals } })))
  }
  return result
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
  { label: '0.25×', ms: 1200 },
  { label: '0.5×',  ms: 600  },
  { label: '1×',    ms: 300  },
  { label: '2×',    ms: 150  },
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
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', fontFamily: FONT, fontSize: FONT_SIZE, lineHeight: `${LINE_H}px` }}>
      {/* Line numbers */}
      <div style={{
        width: 48, flexShrink: 0, paddingTop: 12,
        background: 'var(--bg)', borderRight: '1px solid var(--border)',
        overflowY: 'hidden', userSelect: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingRight: 10,
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

        {/* Layer 3: transparent textarea */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={e => onChange(e.target.value)}
          onScroll={syncScroll}
          disabled={disabled}
          spellCheck={false}
          style={{
            ...shared, overflow: 'auto',
            background: 'transparent', border: 'none', outline: 'none', resize: 'none',
            color: 'transparent', caretColor: '#facc15',
            opacity: disabled ? 0.7 : 1,
          }}
        />
      </div>
    </div>
  )
}

// ── Frames & Variables panel ──────────────────────────────────────────────────
function FramesPanel({ frames }: { frames: FrameState[] }) {
  if (frames.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
        No frames yet
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[...frames].reverse().map((frame, i) => {
        const isTop = i === 0
        const entries = Object.entries(frame.locals)
        return (
          <div key={i} style={{
            border: `1px solid ${isTop ? '#facc1540' : 'var(--border)'}`,
            borderRadius: 8,
            background: isTop ? 'rgba(250,204,21,0.04)' : 'var(--bg-card)',
            overflow: 'hidden',
          }}>
            {/* Frame header */}
            <div style={{
              padding: '5px 10px',
              background: isTop ? 'rgba(250,204,21,0.1)' : 'var(--bg-panel)',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: isTop ? '#facc15' : 'var(--text-muted)',
                fontFamily: FONT, letterSpacing: '0.03em',
              }}>
                {frame.name === '<module>' ? 'Global frame' : `${frame.name}()`}
              </span>
              {isTop && (
                <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#facc1520', color: '#facc15', marginLeft: 'auto' }}>
                  active
                </span>
              )}
            </div>

            {/* Variables */}
            {entries.length === 0 ? (
              <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic' }}>empty</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {entries.map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{
                        padding: '4px 10px', fontSize: 11,
                        fontFamily: FONT, color: '#9cdcfe',
                        width: '35%', verticalAlign: 'top',
                      }}>
                        {k}
                      </td>
                      <td style={{
                        padding: '4px 10px', fontSize: 11,
                        fontFamily: FONT, color: '#ce9178',
                        wordBreak: 'break-all',
                      }}>
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
  const [stacks, setStacks] = useState<FrameState[][]>([])
  const [running, setRunning] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [speedIdx, setSpeedIdx] = useState(2)   // default 1×
  const [error, setError] = useState('')
  const [stdout, setStdout] = useState('')
  const [stderr, setStderr] = useState('')
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Derived highlights
  const activeLines = new Set<number>()
  const executedSet = new Set<number>()
  for (let i = 0; i <= currentStep && i < events.length; i++) {
    const e = events[i]
    if (e.line > 0) executedSet.add(e.line)
  }
  if (currentStep >= 0 && currentStep < events.length && events[currentStep].line > 0) {
    activeLines.add(events[currentStep].line)
  }

  const stopAnimation = useCallback(() => {
    if (animRef.current) clearTimeout(animRef.current)
    setAnimating(false)
  }, [])

  const startAnimation = useCallback((evts: TraceEvent[], fromStep = 0) => {
    setAnimating(true)
    let step = fromStep
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
    animRef.current = setTimeout(tick, 80)
  }, [speedIdx])

  useEffect(() => () => { if (animRef.current) clearTimeout(animRef.current) }, [])

  async function runCode() {
    stopAnimation()
    setRunning(true)
    setError('')
    setStdout('')
    setStderr('')
    setEvents([])
    setStacks([])
    setCurrentStep(-1)

    try {
      const { data } = await axios.post('/api/run-code', { code })
      if (!data.ok) { setError(data.error || 'Execution failed'); return }
      const evts: TraceEvent[] = data.events || []
      setEvents(evts)
      setStacks(buildStacks(evts))
      setStdout(data.stdout || '')
      setStderr(data.stderr || '')
      setTimeout(() => startAnimation(evts, 0), 150)
    } catch (e: any) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setRunning(false)
    }
  }

  function reset() {
    stopAnimation()
    setEvents([])
    setStacks([])
    setCurrentStep(-1)
    setError('')
    setStdout('')
    setStderr('')
  }

  function stepTo(s: number) {
    stopAnimation()
    setCurrentStep(Math.max(-1, Math.min(s, events.length - 1)))
  }

  const totalSteps = events.length
  const isFinished = !animating && totalSteps > 0 && currentStep >= totalSteps - 1
  const errorEvent = events.find(e => e.event === 'error')
  const currentFrames = currentStep >= 0 && currentStep < stacks.length ? stacks[currentStep] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Unified top toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 14px', height: 44, flexShrink: 0,
        borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>PYTHON</span>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />

        {/* Speed */}
        <div style={{ display: 'flex', gap: 3 }}>
          {SPEEDS.map((s, i) => (
            <button key={i} onClick={() => setSpeedIdx(i)} style={{
              padding: '3px 9px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: speedIdx === i ? 'var(--accent)' : 'var(--bg-input)',
              color: speedIdx === i ? '#fff' : 'var(--text-muted)',
              fontWeight: speedIdx === i ? 600 : 400,
            }}>{s.label}</button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Step counter */}
        {totalSteps > 0 && (
          <span style={{ fontSize: 11, color: isFinished ? '#22c55e' : 'var(--text-muted)' }}>
            {currentStep < 0 ? '–' : `Step ${currentStep + 1}`} / {totalSteps}
          </span>
        )}

        {/* Reset */}
        {totalSteps > 0 && (
          <button onClick={reset} title="Clear" style={{
            padding: '5px 8px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--bg-input)',
            color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}>
            <RotateCcw size={13} />
          </button>
        )}

        {/* Run / Pause */}
        {animating ? (
          <button onClick={stopAnimation} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 16px', borderRadius: 7, border: 'none',
            background: '#f59e0b', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            <Pause size={12} fill="#fff" /> Pause
          </button>
        ) : (
          <button onClick={totalSteps > 0 && !isFinished ? () => startAnimation(events, currentStep < 0 ? 0 : currentStep) : runCode}
            disabled={running || (!totalSteps && !code.trim())}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 16px', borderRadius: 7, border: 'none',
              background: running ? 'var(--bg-input)' : '#22c55e',
              color: running ? 'var(--text-muted)' : '#fff',
              fontSize: 12, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer',
              opacity: running ? 0.6 : 1,
            }}>
            {running
              ? <><Loader2 size={12} className="animate-spin" /> Running…</>
              : <><Play size={12} fill="#fff" /> {totalSteps > 0 && !isFinished ? 'Resume' : 'Run Trace'}</>
            }
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: Code editor */}
        <div style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
          <CodeEditor
            code={code}
            onChange={c => { setCode(c); reset() }}
            activeLines={activeLines}
            executedSet={executedSet}
            disabled={running || animating}
          />

          {(error || errorEvent) && (
            <div style={{ padding: '8px 14px', flexShrink: 0, borderTop: '1px solid #ef444440', background: '#ef444410', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <AlertTriangle size={13} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
              <pre style={{ fontSize: 11, color: '#ef4444', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {error || errorEvent?.error}
              </pre>
            </div>
          )}
          {stdout && (
            <div style={{ padding: '6px 14px', flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2, letterSpacing: '0.05em' }}>OUTPUT</div>
              <pre style={{ fontSize: 11, color: '#a3e635', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{stdout}</pre>
            </div>
          )}
          {stderr && !error && !errorEvent && (
            <div style={{ padding: '6px 14px', flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
              <pre style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, whiteSpace: 'pre-wrap' }}>{stderr}</pre>
            </div>
          )}
        </div>

        {/* Right: Frames + navigation */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{
            padding: '0 14px', height: 36, flexShrink: 0,
            borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>FRAMES</span>
            {currentFrames.length > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                {currentFrames.length} frame{currentFrames.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Frames panel */}
          {totalSteps === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={18} style={{ color: 'var(--text-faint)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Write code and click Run Trace</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Variables and call frames appear here</div>
              </div>
            </div>
          ) : (
            <FramesPanel frames={currentFrames} />
          )}

          {/* Step navigation */}
          {totalSteps > 0 && (
            <div style={{
              flexShrink: 0, padding: '10px 14px',
              borderTop: '1px solid var(--border)', background: 'var(--bg-panel)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {/* Slider */}
              <input
                type="range"
                min={0}
                max={totalSteps - 1}
                value={Math.max(0, currentStep)}
                onChange={e => stepTo(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#facc15', cursor: 'pointer' }}
              />

              {/* Step buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <button onClick={() => stepTo(0)} disabled={currentStep <= 0} title="First" style={navBtn(currentStep <= 0)}>
                  <SkipBack size={13} />
                </button>
                <button onClick={() => stepTo(currentStep - 1)} disabled={currentStep <= 0} title="Previous" style={navBtn(currentStep <= 0)}>
                  <ChevronLeft size={13} />
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 80, textAlign: 'center' }}>
                  {currentStep < 0 ? '–' : `${currentStep + 1} / ${totalSteps}`}
                </span>
                <button onClick={() => stepTo(currentStep + 1)} disabled={currentStep >= totalSteps - 1} title="Next" style={navBtn(currentStep >= totalSteps - 1)}>
                  <ChevronRight size={13} />
                </button>
                <button onClick={() => stepTo(totalSteps - 1)} disabled={currentStep >= totalSteps - 1} title="Last" style={navBtn(currentStep >= totalSteps - 1)}>
                  <SkipForward size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function navBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 6,
    border: '1px solid var(--border)',
    background: disabled ? 'transparent' : 'var(--bg-input)',
    color: disabled ? 'var(--text-faint)' : 'var(--text-muted)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  }
}
