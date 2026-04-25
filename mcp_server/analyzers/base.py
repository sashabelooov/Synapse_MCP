"""Base analyzer — walks a project directory and returns structured data."""
import ast
import json
from pathlib import Path
from typing import Optional

from .ast_parser import parse_file, FileInfo


SKIP_DIRS = {
    ".git", "__pycache__", ".venv", "venv", "env", "node_modules",
    "migrations", ".mcp_mental_model", "dist", "build", ".mypy_cache",
    ".pytest_cache", "htmlcov", ".tox",
}


def detect_framework(project_path: Path) -> str:
    """Heuristic: look for framework-specific files."""
    if (project_path / "manage.py").exists():
        return "django"
    for f in project_path.rglob("*.py"):
        if f.stat().st_size > 500_000:
            continue
        try:
            src = f.read_text(errors="ignore")
            if "FastAPI" in src or "fastapi" in src:
                return "fastapi"
        except OSError:
            pass
    return "unknown"


def collect_python_files(project_path: Path) -> list[Path]:
    files = []
    for p in project_path.rglob("*.py"):
        if any(skip in p.parts for skip in SKIP_DIRS):
            continue
        files.append(p)
    return sorted(files)


def build_tree_node(project_path: Path) -> dict:
    """Return a nested dict representing the directory tree."""

    def _node(p: Path) -> dict:
        if p.is_file():
            return {"name": p.name, "type": "file", "path": str(p)}
        children = []
        try:
            for child in sorted(p.iterdir()):
                if child.name in SKIP_DIRS:
                    continue
                if child.is_dir() or child.is_file():
                    children.append(_node(child))
        except PermissionError:
            pass
        return {"name": p.name, "type": "dir", "path": str(p), "children": children}

    return _node(project_path)
