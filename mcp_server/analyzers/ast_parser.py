"""Core AST utilities shared by all framework analyzers."""
import ast
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class FunctionInfo:
    name: str
    qualified_name: str
    line_start: int
    line_end: int
    is_async: bool
    decorators: list[str]
    parameters: list[str]
    return_type: Optional[str]
    docstring: Optional[str]
    calls: list[dict]  # {callee_name, line}


@dataclass
class FileInfo:
    path: str
    relative_path: str
    file_role: str
    functions: list[FunctionInfo] = field(default_factory=list)
    imports: list[str] = field(default_factory=list)


def parse_file(file_path: Path, project_root: Path) -> Optional[FileInfo]:
    try:
        source = file_path.read_text(encoding="utf-8", errors="ignore")
        tree = ast.parse(source, filename=str(file_path))
    except SyntaxError:
        return None

    relative = str(file_path.relative_to(project_root))
    role = _infer_role(file_path)
    info = FileInfo(path=str(file_path), relative_path=relative, file_role=role)

    # Collect top-level imports
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            info.imports.append(ast.unparse(node))

    # Collect functions/methods
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            info.functions.append(_extract_function(node, file_path.stem))

    return info


def _extract_function(node: ast.FunctionDef | ast.AsyncFunctionDef, module: str) -> FunctionInfo:
    decorators = [ast.unparse(d) for d in node.decorator_list]
    params = [a.arg for a in node.args.args]
    ret = ast.unparse(node.returns) if node.returns else None
    doc = ast.get_docstring(node)

    calls: list[dict] = []
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            name = _call_name(child)
            if name:
                calls.append({"callee_name": name, "line": child.lineno})

    return FunctionInfo(
        name=node.name,
        qualified_name=f"{module}.{node.name}",
        line_start=node.lineno,
        line_end=node.end_lineno or node.lineno,
        is_async=isinstance(node, ast.AsyncFunctionDef),
        decorators=decorators,
        parameters=params,
        return_type=ret,
        docstring=doc,
        calls=calls,
    )


def _call_name(node: ast.Call) -> Optional[str]:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        try:
            return ast.unparse(node.func)
        except Exception:
            return node.func.attr
    return None


def _infer_role(path: Path) -> str:
    name = path.stem.lower()
    roles = {
        "models": "model",
        "model": "model",
        "schemas": "schema",
        "schema": "schema",
        "serializers": "schema",
        "views": "view",
        "routes": "router",
        "routers": "router",
        "router": "router",
        "services": "service",
        "service": "service",
        "repositories": "repository",
        "repository": "repository",
        "deps": "dependency",
        "dependencies": "dependency",
        "utils": "utility",
        "helpers": "utility",
        "main": "entrypoint",
        "app": "entrypoint",
        "urls": "router",
        "admin": "admin",
        "signals": "signal",
        "tasks": "task",
        "middleware": "middleware",
        "config": "config",
        "settings": "config",
    }
    return roles.get(name, "module")
