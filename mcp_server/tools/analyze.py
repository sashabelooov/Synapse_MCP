"""analyze_project MCP tool — full static analysis pipeline."""
import json
from pathlib import Path

from ..analyzers.base import detect_framework, collect_python_files, build_tree_node
from ..analyzers.ast_parser import parse_file
from ..analyzers.fastapi_analyzer import extract_routes as fa_routes, detect_db_models_sqlalchemy
from ..analyzers.django_analyzer import extract_routes as dj_routes, detect_db_models as dj_models
from ..analyzers.devops_analyzer import detect_devops_files, build_devops_graph
from ..storage.database import get_db, upsert_project, clear_project_data
from ..config import get_db_path


async def analyze_project(path: str) -> dict:
    project_path = Path(path).resolve()
    if not project_path.is_dir():
        return {"ok": False, "error": f"Not a directory: {path}"}

    framework = detect_framework(project_path)
    name = project_path.name
    db_path = get_db_path(str(project_path))

    stats = {"files": 0, "functions": 0, "routes": 0, "db_models": 0, "devops_files": 0}

    async with get_db(db_path) as db:
        project_id = await upsert_project(db, str(project_path), name, framework)

        # Clear stale data
        await _clear_all(db, project_id)

        py_files = collect_python_files(project_path)

        # Map qualified_name → db function id for resolving calls
        func_name_to_id: dict[str, int] = {}

        for py_file in py_files:
            file_info = parse_file(py_file, project_path)
            if file_info is None:
                continue

            cur = await db.execute(
                "INSERT OR REPLACE INTO files (project_id, path, relative_path, file_role) VALUES (?,?,?,?)",
                (project_id, file_info.path, file_info.relative_path, file_info.file_role),
            )
            file_id = cur.lastrowid
            stats["files"] += 1

            for fn in file_info.functions:
                cur2 = await db.execute(
                    """INSERT INTO functions
                       (file_id, name, qualified_name, line_start, line_end,
                        is_async, decorators, parameters, return_type, docstring)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (
                        file_id, fn.name, fn.qualified_name,
                        fn.line_start, fn.line_end, int(fn.is_async),
                        json.dumps(fn.decorators), json.dumps(fn.parameters),
                        fn.return_type, fn.docstring,
                    ),
                )
                func_id = cur2.lastrowid
                func_name_to_id[fn.qualified_name] = func_id
                func_name_to_id[fn.name] = func_id  # short name fallback
                stats["functions"] += 1

        await db.commit()

        # Second pass: insert calls with resolved callee ids
        for py_file in py_files:
            file_info = parse_file(py_file, project_path)
            if not file_info:
                continue
            cur = await db.execute(
                "SELECT id FROM files WHERE path=?", (str(py_file),)
            )
            row = await cur.fetchone()
            if not row:
                continue
            for fn in file_info.functions:
                caller_id = func_name_to_id.get(fn.qualified_name)
                if not caller_id:
                    continue
                for call in fn.calls:
                    callee_id = func_name_to_id.get(call["callee_name"])
                    await db.execute(
                        "INSERT INTO calls (caller_id, callee_name, callee_id, line_number) VALUES (?,?,?,?)",
                        (caller_id, call["callee_name"], callee_id, call["line"]),
                    )
        await db.commit()

        # Routes
        route_extractor = fa_routes if framework == "fastapi" else dj_routes
        model_extractor = detect_db_models_sqlalchemy if framework == "fastapi" else dj_models

        for py_file in py_files:
            try:
                source = py_file.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue

            rel = str(py_file.relative_to(project_path))

            if framework == "fastapi":
                routes = route_extractor(None, source)  # type: ignore
            else:
                routes = route_extractor(source, rel)

            for r in routes:
                handler_id = func_name_to_id.get(r["handler"])
                await db.execute(
                    "INSERT INTO routes (project_id, method, path, handler_id, tags) VALUES (?,?,?,?,?)",
                    (project_id, r["method"], r["path"], handler_id, json.dumps(r["tags"])),
                )
                stats["routes"] += 1

            db_model_list = model_extractor(source, rel)
            for m in db_model_list:
                file_cur = await db.execute("SELECT id FROM files WHERE project_id=? AND relative_path=?", (project_id, rel))
                file_row = await file_cur.fetchone()
                file_id = file_row["id"] if file_row else None
                await db.execute(
                    "INSERT INTO db_models (project_id, name, table_name, file_id, fields) VALUES (?,?,?,?,?)",
                    (project_id, m["name"], m["table_name"], file_id, json.dumps(m["fields"])),
                )
                stats["db_models"] += 1

        # DevOps analysis
        devops_files = detect_devops_files(project_path)
        devops_graph = build_devops_graph(devops_files, name)
        # Store devops graph as a single execution trace record (reuse table for now)
        await db.execute(
            "INSERT INTO execution_traces (project_id, label, entry_point, trace_data) VALUES (?,?,?,?)",
            (project_id, "__devops__", "__devops__", json.dumps({
                "files": devops_files,
                "graph": devops_graph,
            })),
        )
        stats["devops_files"] = len(devops_files)

        await db.commit()

    return {
        "ok": True,
        "project": name,
        "framework": framework,
        "stats": stats,
        "db_path": str(db_path),
    }


async def _clear_all(db, project_id: int):
    """Wipe all derived data for a project before re-analysis."""
    await db.execute("DELETE FROM routes WHERE project_id=?", (project_id,))
    await db.execute("DELETE FROM db_models WHERE project_id=?", (project_id,))
    await db.execute("DELETE FROM execution_traces WHERE project_id=?", (project_id,))

    file_cur = await db.execute("SELECT id FROM files WHERE project_id=?", (project_id,))
    file_rows = await file_cur.fetchall()
    for row in file_rows:
        await db.execute("DELETE FROM calls WHERE caller_id IN (SELECT id FROM functions WHERE file_id=?)", (row["id"],))
        await db.execute("DELETE FROM functions WHERE file_id=?", (row["id"],))
    await db.execute("DELETE FROM files WHERE project_id=?", (project_id,))
    await db.commit()
