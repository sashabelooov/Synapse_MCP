"""Django-specific analyzer: extracts URL patterns, views, ORM models."""
import ast
import re
from pathlib import Path
from typing import Optional

from .ast_parser import FileInfo


def extract_routes(source: str, file_path: str) -> list[dict]:
    """Parse urls.py and return list of {method, path, handler, tags}."""
    routes = []
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return routes

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func_name = _call_func_name(node)
        if func_name not in {"path", "re_path", "url"}:
            continue

        url_path = ""
        handler = ""
        if node.args:
            try:
                url_path = ast.literal_eval(node.args[0])
            except Exception:
                url_path = ast.unparse(node.args[0])
        if len(node.args) > 1:
            handler = ast.unparse(node.args[1])

        routes.append({
            "method": "ANY",
            "path": url_path,
            "handler": handler,
            "tags": [],
        })
    return routes


def detect_db_models(source: str, file_path: str) -> list[dict]:
    """Extract Django ORM models (subclasses of models.Model)."""
    models = []
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return models

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        bases = [ast.unparse(b) for b in node.bases]
        is_model = any("Model" in b for b in bases)
        if not is_model:
            continue

        fields = []
        for item in node.body:
            if isinstance(item, ast.Assign):
                for t in item.targets:
                    if isinstance(t, ast.Name) and not t.id.startswith("_"):
                        fields.append({"name": t.id, "type": ast.unparse(item.value)})
            elif isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                fields.append({
                    "name": item.target.id,
                    "type": ast.unparse(item.annotation) if item.annotation else "Any",
                })

        # Django auto table name: appname_modelname (we use model name lowercased)
        table_name = node.name.lower()
        for item in node.body:
            if isinstance(item, ast.ClassDef) and item.name == "Meta":
                for meta_item in item.body:
                    if isinstance(meta_item, ast.Assign):
                        for t in meta_item.targets:
                            if isinstance(t, ast.Name) and t.id == "db_table":
                                try:
                                    table_name = ast.literal_eval(meta_item.value)
                                except Exception:
                                    pass

        models.append({
            "name": node.name,
            "table_name": table_name,
            "file": file_path,
            "fields": [f for f in fields if f["name"] != "Meta"],
        })
    return models


def _call_func_name(node: ast.Call) -> str:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    return ""
