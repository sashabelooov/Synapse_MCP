import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS projects (
  id            INTEGER PRIMARY KEY,
  path          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  framework     TEXT,
  last_analyzed TIMESTAMP,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path          TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  file_role     TEXT,
  UNIQUE(project_id, path)
);

CREATE TABLE IF NOT EXISTS functions (
  id             INTEGER PRIMARY KEY,
  file_id        INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  qualified_name TEXT,
  line_start     INTEGER,
  line_end       INTEGER,
  is_async       INTEGER DEFAULT 0,
  is_class       INTEGER DEFAULT 0,
  decorators     TEXT DEFAULT '[]',
  parameters     TEXT DEFAULT '[]',
  return_type    TEXT,
  docstring      TEXT
);

CREATE TABLE IF NOT EXISTS calls (
  id          INTEGER PRIMARY KEY,
  caller_id   INTEGER NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  callee_name TEXT NOT NULL,
  callee_id   INTEGER REFERENCES functions(id),
  line_number INTEGER
);

CREATE TABLE IF NOT EXISTS routes (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  method     TEXT,
  path       TEXT,
  handler_id INTEGER REFERENCES functions(id),
  tags       TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS db_models (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  table_name TEXT,
  file_id    INTEGER REFERENCES files(id),
  fields     TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS execution_traces (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label       TEXT,
  entry_point TEXT NOT NULL,
  trace_data  TEXT DEFAULT '[]',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`

const dbCache = new Map<string, DatabaseSync>()

export function getDb(dbPath: string): DatabaseSync {
  if (dbCache.has(dbPath)) return dbCache.get(dbPath)!
  const db = new DatabaseSync(dbPath)
  db.exec(SCHEMA)
  dbCache.set(dbPath, db)
  return db
}

export function upsertProject(db: DatabaseSync, projectPath: string, name: string, framework: string): number {
  db.prepare(`
    INSERT INTO projects (path, name, framework, last_analyzed)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(path) DO UPDATE SET
      name=excluded.name,
      framework=excluded.framework,
      last_analyzed=excluded.last_analyzed
  `).run(projectPath, name, framework)
  const row = db.prepare('SELECT id FROM projects WHERE path=?').get(projectPath) as { id: number }
  return row.id
}

export function clearProjectData(db: DatabaseSync, projectId: number): void {
  // Disable FK checks for the duration of this wipe so ordering doesn't matter
  db.exec('PRAGMA foreign_keys=OFF')
  try {
    for (const table of ['calls', 'functions', 'routes', 'db_models', 'execution_traces', 'files']) {
      if (table === 'files' || table === 'routes' || table === 'db_models' || table === 'execution_traces') {
        db.prepare(`DELETE FROM ${table} WHERE project_id=?`).run(projectId)
      } else if (table === 'functions') {
        db.prepare(
          'DELETE FROM functions WHERE file_id IN (SELECT id FROM files WHERE project_id=?)'
        ).run(projectId)
      } else if (table === 'calls') {
        db.prepare(
          'DELETE FROM calls WHERE caller_id IN (SELECT id FROM functions WHERE file_id IN (SELECT id FROM files WHERE project_id=?))'
        ).run(projectId)
      }
    }
  } finally {
    db.exec('PRAGMA foreign_keys=ON')
  }
}
