import fs from 'fs'
import path from 'path'

const DEVOPS_PATTERNS: Record<string, string[]> = {
  docker: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore'],
  nginx: ['nginx.conf', 'nginx/*.conf', 'conf.d/*.conf'],
  github_actions: ['.github/workflows/*.yml', '.github/workflows/*.yaml'],
  gitlab_ci: ['.gitlab-ci.yml'],
  circle_ci: ['.circleci/config.yml'],
  kubernetes: ['k8s/*.yaml', 'k8s/*.yml', 'kubernetes/*.yaml', 'helm/*/Chart.yaml'],
  terraform: ['*.tf', 'terraform/*.tf'],
  ansible: ['playbook.yml', 'ansible/*.yml'],
  pre_commit: ['.pre-commit-config.yaml'],
  requirements: ['requirements.txt'],
  pyproject: ['pyproject.toml'],
}

const SKIP_DIRS = new Set(['.git', '__pycache__', '.venv', 'venv', 'node_modules', '.mcp_mental_model'])

export interface DevopsFile {
  category: string
  path: string
  relativePath: string
  size: number
  summary: string
}

export function detectDevopsFiles(projectPath: string): DevopsFile[] {
  const found: DevopsFile[] = []

  for (const [category, patterns] of Object.entries(DEVOPS_PATTERNS)) {
    for (const pattern of patterns) {
      // Try direct path first
      const direct = path.join(projectPath, pattern)
      if (!pattern.includes('*') && fs.existsSync(direct)) {
        try {
          const stat = fs.statSync(direct)
          found.push({
            category,
            path: direct,
            relativePath: path.relative(projectPath, direct),
            size: stat.size,
            summary: summarizeFile(direct, category),
          })
        } catch {}
        continue
      }

      // For glob patterns, do manual walk
      if (pattern.includes('*')) {
        const parts = pattern.split('/')
        searchGlob(projectPath, parts, 0, projectPath, category, found)
      }
    }
  }

  // Deduplicate by path
  const seen = new Set<string>()
  return found.filter(f => {
    if (seen.has(f.path)) return false
    seen.add(f.path)
    return true
  })
}

function searchGlob(baseDir: string, parts: string[], partIdx: number, projectPath: string, category: string, found: DevopsFile[]): void {
  if (partIdx >= parts.length) return
  const part = parts[partIdx]

  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(baseDir, { withFileTypes: true }) } catch { return }

  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    if (part === '*' || matchGlob(e.name, part)) {
      const full = path.join(baseDir, e.name)
      if (partIdx === parts.length - 1 && e.isFile()) {
        try {
          const stat = fs.statSync(full)
          found.push({
            category,
            path: full,
            relativePath: path.relative(projectPath, full),
            size: stat.size,
            summary: summarizeFile(full, category),
          })
        } catch {}
      } else if (e.isDirectory()) {
        searchGlob(full, parts, partIdx + 1, projectPath, category, found)
      }
    }
  }
}

function matchGlob(name: string, pattern: string): boolean {
  if (pattern === '*') return true
  const escaped = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(name)
}

function summarizeFile(filePath: string, category: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8').slice(0, 500)
    if (category === 'docker') {
      const from = content.match(/^FROM\s+(.+)/m)
      return from ? `Base: ${from[1]}` : 'Dockerfile'
    }
    if (category === 'github_actions') {
      const name = content.match(/^name:\s*(.+)/m)
      return name ? `Workflow: ${name[1]}` : 'GitHub Actions'
    }
    return path.basename(filePath)
  } catch {
    return path.basename(filePath)
  }
}

export interface DevopsNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: { label: string; category: string; relativePath: string; summary: string }
}

export interface DevopsEdge {
  id: string
  source: string
  target: string
}

export function buildDevopsGraph(files: DevopsFile[]): { nodes: DevopsNode[]; edges: DevopsEdge[] } {
  const categoryColors: Record<string, string> = {
    docker: '#0ea5e9',
    nginx: '#22c55e',
    github_actions: '#8b5cf6',
    gitlab_ci: '#f97316',
    kubernetes: '#06b6d4',
    terraform: '#7c3aed',
    ansible: '#ef4444',
    requirements: '#f59e0b',
    pyproject: '#f59e0b',
    pre_commit: '#64748b',
  }

  const nodes: DevopsNode[] = []
  const edges: DevopsEdge[] = []
  const categories = [...new Set(files.map(f => f.category))]

  categories.forEach((cat, ci) => {
    const catFiles = files.filter(f => f.category === cat)
    catFiles.forEach((f, fi) => {
      const id = `devops-${ci}-${fi}`
      nodes.push({
        id,
        type: 'devops',
        position: { x: ci * 320, y: fi * 140 },
        data: {
          label: path.basename(f.path),
          category: cat,
          relativePath: f.relativePath,
          summary: f.summary,
        },
      })
    })
  })

  // Connect docker → app entry if both exist
  const dockerNode = nodes.find(n => n.data.category === 'docker')
  const appNode = nodes.find(n => !['docker', 'nginx', 'kubernetes'].includes(n.data.category))
  if (dockerNode && appNode) {
    edges.push({ id: `e-docker-app`, source: dockerNode.id, target: appNode.id })
  }

  return { nodes, edges }
}
