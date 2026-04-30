import path from 'path'
import fs from 'fs'

export const DB_DIR_NAME = '.mcp_mental_model'
export const DB_FILE_NAME = 'db.sqlite'
export const UI_HOST = '127.0.0.1'
export const UI_PORT = 7432

export function getDbPath(projectPath: string): string {
  const dbDir = path.join(path.resolve(projectPath), DB_DIR_NAME)
  fs.mkdirSync(dbDir, { recursive: true })
  return path.join(dbDir, DB_FILE_NAME)
}
