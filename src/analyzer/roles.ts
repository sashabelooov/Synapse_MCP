import path from 'path'

export function inferRole(filePath: string): string {
  const name = path.basename(filePath).toLowerCase()
  const parts = filePath.toLowerCase().split(path.sep)

  if (name.includes('route') || name.includes('view') || name.includes('endpoint')) return 'entrypoint'
  if (name === 'main.py' || name === 'app.py' || name === 'wsgi.py' || name === 'asgi.py') return 'entrypoint'
  if (name.includes('router')) return 'router'
  if (name.includes('service')) return 'service'
  if (name.includes('repository') || name.includes('repo') || name.includes('crud') || name.includes('dao')) return 'repository'
  if (name.includes('model')) return 'model'
  if (name.includes('schema') || name.includes('serializer')) return 'schema'
  if (name.includes('depend') || name.includes('middleware')) return 'dependency'
  if (name.includes('util') || name.includes('helper') || name.includes('common')) return 'utility'
  if (name.includes('config') || name.includes('setting')) return 'config'
  if (name.includes('test') || name.startsWith('test_')) return 'test'
  if (parts.includes('migrations')) return 'migration'

  return 'module'
}
