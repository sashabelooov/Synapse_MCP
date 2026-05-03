export interface ArchNodeData {
  label: string
  icon: string
  nodeType: 'client' | 'service' | 'database' | 'queue' | 'gateway' | 'cache' | 'storage' | 'mobile'
  color?: string
}

export interface DiagramData {
  id?: string
  name: string
  description: string
  projectPath?: string
  nodes: Array<{
    id: string
    icon: string
    label: string
    nodeType: ArchNodeData['nodeType']
    color?: string
    x: number
    y: number
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    label?: string
    style: 'solid' | 'dashed'
  }>
  groups: Array<{
    id: string
    label: string
    nodeIds: string[]
    color: string
    x?: number
    y?: number
    width?: number
    height?: number
  }>
  createdAt?: string
  updatedAt?: string
}

export interface DiagramMeta {
  id: string
  name: string
  description: string
  projectPath?: string
  createdAt: string
  updatedAt: string
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string }
