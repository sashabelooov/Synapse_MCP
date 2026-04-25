"""trace_execution MCP tool."""
import json
from pathlib import Path

from ..tracer.dynamic_tracer import trace_function
from ..storage.database import get_db, fetch_all_as_dicts
from ..config import get_db_path


async def trace_execution(
    path: str,
    module_file: str,
    function_name: str,
    args: list = None,
    label: str = None,
) -> dict:
    result = await trace_function(path, module_file, function_name, args or [])

    if not result["ok"]:
        return result

    trace = result["trace"]
    label = label or f"{module_file}::{function_name}"
    db_path = get_db_path(path)

    async with get_db(db_path) as db:
        cur = await db.execute("SELECT id FROM projects WHERE path=?", (str(Path(path).resolve()),))
        row = await cur.fetchone()
        if row:
            await db.execute(
                "INSERT INTO execution_traces (project_id, label, entry_point, trace_data) VALUES (?,?,?,?)",
                (row["id"], label, f"{module_file}::{function_name}", json.dumps(trace)),
            )
            await db.commit()

    return {
        "ok": True,
        "label": label,
        "total_calls": len([e for e in trace if e.get("event") == "call"]),
        "trace": trace,
        "stderr": result.get("stderr", ""),
    }


async def get_traces(path: str) -> dict:
    db_path = get_db_path(path)
    async with get_db(db_path) as db:
        cur = await db.execute("SELECT id FROM projects WHERE path=?", (str(Path(path).resolve()),))
        row = await cur.fetchone()
        if not row:
            return {"ok": False, "error": "Project not analyzed yet."}

        traces = await fetch_all_as_dicts(
            db,
            "SELECT id, label, entry_point, created_at FROM execution_traces "
            "WHERE project_id=? AND label != '__devops__' ORDER BY id DESC",
            (row["id"],),
        )

    return {"ok": True, "traces": traces}


async def get_trace_detail(path: str, trace_id: int) -> dict:
    db_path = get_db_path(path)
    async with get_db(db_path) as db:
        cur = await db.execute(
            "SELECT * FROM execution_traces WHERE id=?", (trace_id,)
        )
        row = await cur.fetchone()
        if not row:
            return {"ok": False, "error": "Trace not found"}

        data = dict(row)
        data["trace_data"] = json.loads(data["trace_data"])
    return {"ok": True, **data}
