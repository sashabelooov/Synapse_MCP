"""Query tools: get_project_tree, get_call_graph, get_db_schema, get_routes, get_devops."""
import json
from pathlib import Path

from ..analyzers.base import build_tree_node
from ..graph.builder import build_call_graph, build_db_graph
from ..storage.database import get_db, fetch_all_as_dicts
from ..config import get_db_path


async def get_project_tree(path: str) -> dict:
    project_path = Path(path).resolve()
    tree = build_tree_node(project_path)
    return {"ok": True, "tree": tree}


async def get_call_graph(path: str, function_name: str = None) -> dict:
    db_path = get_db_path(path)
    async with get_db(db_path) as db:
        project = await _require_project(db, path)
        if not project:
            return {"ok": False, "error": "Project not analyzed yet. Run analyze_project first."}

        pid = project["id"]

        if function_name:
            # Subgraph starting from a specific function
            cur = await db.execute(
                "SELECT f.*, fi.file_role FROM functions f JOIN files fi ON fi.id=f.file_id "
                "WHERE fi.project_id=? AND f.name=? LIMIT 1",
                (pid, function_name),
            )
            root = await cur.fetchone()
            if not root:
                return {"ok": False, "error": f"Function '{function_name}' not found"}

            func_ids = await _reachable_ids(db, root["id"], max_depth=6)
            functions = await fetch_all_as_dicts(
                db,
                f"SELECT f.*, fi.file_role FROM functions f JOIN files fi ON fi.id=f.file_id "
                f"WHERE f.id IN ({','.join('?'*len(func_ids))})",
                tuple(func_ids),
            )
            calls = await fetch_all_as_dicts(
                db,
                f"SELECT * FROM calls WHERE caller_id IN ({','.join('?'*len(func_ids))})",
                tuple(func_ids),
            )
        else:
            functions = await fetch_all_as_dicts(
                db,
                "SELECT f.*, fi.file_role FROM functions f JOIN files fi ON fi.id=f.file_id WHERE fi.project_id=?",
                (pid,),
            )
            calls = await fetch_all_as_dicts(
                db,
                "SELECT c.* FROM calls c JOIN functions f ON f.id=c.caller_id "
                "JOIN files fi ON fi.id=f.file_id WHERE fi.project_id=?",
                (pid,),
            )

    graph = build_call_graph(functions, calls)
    return {"ok": True, **graph}


async def get_db_schema(path: str) -> dict:
    db_path = get_db_path(path)
    async with get_db(db_path) as db:
        project = await _require_project(db, path)
        if not project:
            return {"ok": False, "error": "Project not analyzed yet."}

        models = await fetch_all_as_dicts(
            db, "SELECT * FROM db_models WHERE project_id=?", (project["id"],)
        )
        for m in models:
            if isinstance(m["fields"], str):
                m["fields"] = json.loads(m["fields"])

    graph = build_db_graph(models)
    return {"ok": True, "models": models, **graph}


async def get_routes(path: str) -> dict:
    db_path = get_db_path(path)
    async with get_db(db_path) as db:
        project = await _require_project(db, path)
        if not project:
            return {"ok": False, "error": "Project not analyzed yet."}

        routes = await fetch_all_as_dicts(
            db,
            "SELECT r.*, f.name as handler_name, f.qualified_name, fi.relative_path "
            "FROM routes r "
            "LEFT JOIN functions f ON f.id=r.handler_id "
            "LEFT JOIN files fi ON fi.id=f.file_id "
            "WHERE r.project_id=?",
            (project["id"],),
        )
        for r in routes:
            if isinstance(r.get("tags"), str):
                r["tags"] = json.loads(r["tags"])

    return {"ok": True, "routes": routes}


async def get_devops(path: str) -> dict:
    db_path = get_db_path(path)
    async with get_db(db_path) as db:
        project = await _require_project(db, path)
        if not project:
            return {"ok": False, "error": "Project not analyzed yet."}

        cur = await db.execute(
            "SELECT trace_data FROM execution_traces WHERE project_id=? AND label='__devops__' ORDER BY id DESC LIMIT 1",
            (project["id"],),
        )
        row = await cur.fetchone()

    if not row:
        return {"ok": True, "files": [], "nodes": [], "edges": []}

    data = json.loads(row["trace_data"])
    return {
        "ok": True,
        "files": data.get("files", []),
        **data.get("graph", {"nodes": [], "edges": []}),
    }


async def _require_project(db, path: str):
    path = str(Path(path).resolve())
    cur = await db.execute("SELECT * FROM projects WHERE path=?", (path,))
    return await cur.fetchone()


async def _reachable_ids(db, start_id: int, max_depth: int) -> set[int]:
    visited = {start_id}
    frontier = {start_id}
    for _ in range(max_depth):
        if not frontier:
            break
        placeholders = ",".join("?" * len(frontier))
        cur = await db.execute(
            f"SELECT callee_id FROM calls WHERE caller_id IN ({placeholders}) AND callee_id IS NOT NULL",
            tuple(frontier),
        )
        rows = await cur.fetchall()
        next_ids = {r["callee_id"] for r in rows} - visited
        visited |= next_ids
        frontier = next_ids
    return visited
