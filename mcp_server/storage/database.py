import json
from pathlib import Path
from contextlib import asynccontextmanager
import aiosqlite

SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS projects (
    id        INTEGER PRIMARY KEY,
    path      TEXT UNIQUE NOT NULL,
    name      TEXT NOT NULL,
    framework TEXT,
    last_analyzed TIMESTAMP,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
    id           INTEGER PRIMARY KEY,
    project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path         TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    file_role    TEXT,
    UNIQUE(project_id, path)
);

CREATE TABLE IF NOT EXISTS functions (
    id             INTEGER PRIMARY KEY,
    file_id        INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    qualified_name TEXT,
    line_start     INTEGER,
    line_end       INTEGER,
    is_async       BOOLEAN DEFAULT 0,
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
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    method      TEXT,
    path        TEXT,
    handler_id  INTEGER REFERENCES functions(id),
    tags        TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS db_models (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    table_name  TEXT,
    file_id     INTEGER REFERENCES files(id),
    fields      TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS execution_traces (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label       TEXT,
    entry_point TEXT NOT NULL,
    trace_data  TEXT DEFAULT '[]',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


@asynccontextmanager
async def get_db(db_path: Path):
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.executescript(SCHEMA)
        yield db


async def upsert_project(db, path: str, name: str, framework: str) -> int:
    await db.execute(
        """INSERT INTO projects (path, name, framework, last_analyzed)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(path) DO UPDATE SET
               name=excluded.name,
               framework=excluded.framework,
               last_analyzed=excluded.last_analyzed""",
        (path, name, framework),
    )
    await db.commit()
    cur = await db.execute("SELECT id FROM projects WHERE path=?", (path,))
    row = await cur.fetchone()
    return row["id"]


async def clear_project_data(db, project_id: int):
    """Remove all derived data before re-analysis."""
    for table in ("routes", "db_models", "calls", "functions", "files"):
        await db.execute(f"DELETE FROM {table} WHERE {'project_id' if table not in ('calls','functions') else 'file_id'} IN "
                         f"({'SELECT id FROM files WHERE project_id=?' if table in ('calls','functions') else '?'})",
                         (project_id,))
    await db.commit()


async def get_project_by_path(db, path: str):
    cur = await db.execute("SELECT * FROM projects WHERE path=?", (path,))
    return await cur.fetchone()


async def fetch_all_as_dicts(db, sql: str, params=()):
    cur = await db.execute(sql, params)
    rows = await cur.fetchall()
    return [dict(r) for r in rows]
