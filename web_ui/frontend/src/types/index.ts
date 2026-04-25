export interface RFNode {
  id: string
  type?: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface RFEdge {
  id: string
  source: string
  target: string
  label?: string
  animated?: boolean
  style?: Record<string, unknown>
}

export interface Route {
  id: number
  method: string
  path: string
  handler_name: string
  relative_path: string
  tags: string[]
}

export interface TraceEvent {
  depth: number
  event: 'call' | 'return' | 'error'
  function: string
  module: string
  file: string
  line: number
  elapsed_ms?: number
  message?: string
}

export interface TraceSummary {
  id: number
  label: string
  entry_point: string
  created_at: string
}

export interface DevopsFile {
  category: string
  file: string
  summary: Record<string, unknown>
}
