"""FastAPI-specific analyzer: extracts routes, routers, dependencies."""
import ast
import json
from pathlib import Path
from typing import Optional

from .ast_parser import FileInfo

ROUTE_DECORATORS = {
    "get", "post", "put", "patch", "delete", "head", "options", "trace",
}


def extract_routes(file_info: FileInfo, source: str) -> list[dict]:
    """Return list of {method, path, handler, tags} from a parsed file."""
    routes = []
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return routes

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in node.decorator_list:
            route = _parse_route_decorator(dec, node.name)
            if route:
                routes.append(route)
    return routes


def _parse_route_decorator(dec: ast.expr, handler_name: str) -> Optional[dict]:
    if not isinstance(dec, ast.Call):
        return None
    func = dec.func

    # @app.get("/path") or @router.post("/path")
    if not isinstance(func, ast.Attribute):
        return None
    method = func.attr.lower()
    if method not in ROUTE_DECORATORS:
        return None

    path_arg = ""
    if dec.args:
        path_arg = ast.unparse(dec.args[0]).strip("'\"")

    tags = []
    for kw in dec.keywords:
        if kw.arg == "tags":
            try:
                tags = ast.literal_eval(kw.value)
            except Exception:
                pass

    return {"method": method.upper(), "path": path_arg, "handler": handler_name, "tags": tags}


def detect_db_models_sqlalchemy(source: str, file_path: str) -> list[dict]:
    """Extract SQLAlchemy/SQLModel table models."""
    models = []
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return models

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        bases = [ast.unparse(b) for b in node.bases]
        # SQLAlchemy Base, SQLModel, DeclarativeBase
        is_model = any(
            b in {"Base", "SQLModel", "DeclarativeBase", "DeclarativeBaseNoMeta"}
            or "Base" in b or "Model" in b
            for b in bases
        )
        if not is_model:
            continue

        fields = []
        table_name = node.name.lower() + "s"
        for item in node.body:
            if isinstance(item, ast.Assign):
                for t in item.targets:
                    if isinstance(t, ast.Name):
                        if t.id == "__tablename__":
                            try:
                                table_name = ast.literal_eval(item.value)
                            except Exception:
                                pass
                        else:
                            fields.append({"name": t.id, "type": ast.unparse(item.value)})
            elif isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                fields.append({
                    "name": item.target.id,
                    "type": ast.unparse(item.annotation) if item.annotation else "Any",
                })

        models.append({
            "name": node.name,
            "table_name": table_name,
            "file": file_path,
            "fields": fields,
        })
    return models
