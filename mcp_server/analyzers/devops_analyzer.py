"""
DevOps analyzer — detects Docker, Nginx, CI/CD, Kubernetes, and other infra files
and maps how they connect to the application code.
"""
import re
import json
from pathlib import Path
from typing import Optional

DEVOPS_PATTERNS = {
    "docker": ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".dockerignore"],
    "nginx":  ["nginx.conf", "nginx/*.conf", "conf.d/*.conf", "default.conf"],
    "github_actions": [".github/workflows/*.yml", ".github/workflows/*.yaml"],
    "gitlab_ci":      [".gitlab-ci.yml"],
    "circle_ci":      [".circleci/config.yml"],
    "travis":         [".travis.yml"],
    "kubernetes":     ["k8s/*.yaml", "k8s/*.yml", "kubernetes/*.yaml", "helm/**/values.yaml"],
    "makefile":       ["Makefile", "makefile"],
    "env":            [".env.example", ".env.sample"],
    "terraform":      ["*.tf", "terraform/*.tf"],
    "ansible":        ["playbook.yml", "ansible/*.yml"],
    "pre_commit":     [".pre-commit-config.yaml"],
    "requirements":   ["requirements.txt", "requirements/*.txt"],
    "pyproject":      ["pyproject.toml"],
}

SKIP_DIRS = {".git", "__pycache__", ".venv", "venv", "node_modules", ".mcp_mental_model"}


def detect_devops_files(project_path: Path) -> list[dict]:
    """Scan the project and return structured info about every infra/devops file found."""
    found = []

    for category, patterns in DEVOPS_PATTERNS.items():
        for pattern in patterns:
            # Use rglob for glob patterns, direct check for exact names
            if "*" in pattern or "/" in pattern:
                for match in project_path.rglob(pattern):
                    if any(skip in match.parts for skip in SKIP_DIRS):
                        continue
                    found.append(_parse_devops_file(match, project_path, category))
            else:
                candidate = project_path / pattern
                if candidate.exists():
                    found.append(_parse_devops_file(candidate, project_path, category))

    return found


def _parse_devops_file(path: Path, project_root: Path, category: str) -> dict:
    relative = str(path.relative_to(project_root))
    content_summary = _summarize(path, category)
    return {
        "category": category,
        "file": relative,
        "abs_path": str(path),
        "summary": content_summary,
    }


def _summarize(path: Path, category: str) -> dict:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return {}

    if category == "docker":
        return _parse_dockerfile(text) if path.name.startswith("Dockerfile") else _parse_compose(text)
    if category == "nginx":
        return _parse_nginx(text)
    if category in ("github_actions", "gitlab_ci", "circle_ci", "travis", "pre_commit"):
        return _parse_ci(text)
    if category == "kubernetes":
        return _parse_k8s(text)
    if category == "requirements":
        return {"packages": [l.strip() for l in text.splitlines() if l.strip() and not l.startswith("#")][:30]}
    return {"raw_preview": text[:500]}


def _parse_dockerfile(text: str) -> dict:
    info: dict = {"instructions": [], "exposed_ports": [], "base_image": None}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        instruction = parts[0].upper()
        value = parts[1] if len(parts) > 1 else ""
        if instruction == "FROM":
            info["base_image"] = value.split()[0]
        elif instruction == "EXPOSE":
            info["exposed_ports"].extend(value.split())
        info["instructions"].append({"cmd": instruction, "value": value[:120]})
    return info


def _parse_compose(text: str) -> dict:
    services = re.findall(r"^\s{2}(\w[\w-]*):", text, re.MULTILINE)
    ports = re.findall(r'"?(\d+:\d+)"?', text)
    images = re.findall(r"image:\s*(.+)", text)
    return {
        "services": list(dict.fromkeys(services)),
        "port_mappings": list(dict.fromkeys(ports)),
        "images": [i.strip() for i in images],
    }


def _parse_nginx(text: str) -> dict:
    proxy_passes = re.findall(r"proxy_pass\s+(https?://[^\s;]+)", text)
    listen_ports = re.findall(r"listen\s+(\d+)", text)
    server_names = re.findall(r"server_name\s+([^;]+);", text)
    locations = re.findall(r"location\s+([^\s{]+)\s*\{", text)
    return {
        "listen_ports": list(dict.fromkeys(listen_ports)),
        "server_names": [s.strip() for s in server_names],
        "locations": locations,
        "proxy_passes": proxy_passes,
    }


def _parse_ci(text: str) -> dict:
    # Extract job/step names generically
    jobs = re.findall(r"^\s{0,4}(\w[\w-]*):\s*$", text, re.MULTILINE)
    run_cmds = re.findall(r"run:\s*(.+)", text)
    uses = re.findall(r"uses:\s*(.+)", text)
    return {
        "jobs": jobs[:20],
        "run_commands": [c.strip()[:100] for c in run_cmds[:20]],
        "actions_used": [u.strip() for u in uses[:20]],
    }


def _parse_k8s(text: str) -> dict:
    kinds = re.findall(r"^kind:\s*(.+)", text, re.MULTILINE)
    names = re.findall(r"^\s{2}name:\s*(.+)", text, re.MULTILINE)
    images = re.findall(r"image:\s*(.+)", text)
    return {
        "resource_kinds": [k.strip() for k in kinds],
        "resource_names": [n.strip() for n in names[:10]],
        "images": [i.strip() for i in images],
    }


def build_devops_graph(devops_files: list[dict], project_name: str) -> dict:
    """Return React Flow nodes/edges for the DevOps architecture view."""
    nodes = []
    edges = []

    category_colors = {
        "docker":          "#2496ed",
        "nginx":           "#009639",
        "github_actions":  "#24292e",
        "gitlab_ci":       "#fc6d26",
        "circle_ci":       "#343434",
        "travis":          "#3eaaaf",
        "kubernetes":      "#326ce5",
        "makefile":        "#6d4c41",
        "env":             "#fbc02d",
        "terraform":       "#7b42bc",
        "ansible":         "#ee0000",
        "requirements":    "#3776ab",
        "pyproject":       "#3776ab",
        "pre_commit":      "#fab040",
    }

    # Central app node
    nodes.append({
        "id": "app",
        "type": "devopsNode",
        "position": {"x": 500, "y": 300},
        "data": {"label": project_name, "category": "app", "color": "#6366f1", "details": {}},
    })

    category_positions = {
        "docker":         (100, 100),
        "nginx":          (900, 100),
        "github_actions": (100, 500),
        "gitlab_ci":      (100, 500),
        "circle_ci":      (100, 500),
        "travis":         (100, 500),
        "kubernetes":     (900, 500),
        "terraform":      (500, 600),
        "makefile":       (300, 600),
        "requirements":   (700, 600),
        "pyproject":      (700, 600),
        "env":            (500, 100),
        "pre_commit":     (300, 100),
        "ansible":        (900, 600),
    }

    seen_categories: set[str] = set()
    for i, df in enumerate(devops_files):
        cat = df["category"]
        nid = f"{cat}-{i}"
        x, y = category_positions.get(cat, (200 + i * 150, 400))
        x += (i % 3) * 20  # small jitter so overlapping categories spread

        nodes.append({
            "id": nid,
            "type": "devopsNode",
            "position": {"x": x, "y": y},
            "data": {
                "label": df["file"],
                "category": cat,
                "color": category_colors.get(cat, "#475569"),
                "details": df["summary"],
            },
        })

        # Connect to app node
        edges.append({
            "id": f"e-app-{nid}",
            "source": "app",
            "target": nid,
            "label": cat.replace("_", " "),
            "style": {"stroke": category_colors.get(cat, "#475569"), "strokeDasharray": "5,5"},
        })

        # nginx → docker proxy connection if both present
        if cat == "nginx":
            docker_nodes = [n["id"] for n in nodes if n["data"]["category"] == "docker"]
            for dn in docker_nodes:
                edges.append({
                    "id": f"e-nginx-docker-{nid}",
                    "source": nid,
                    "target": dn,
                    "label": "proxy_pass",
                    "animated": True,
                    "style": {"stroke": "#009639"},
                })

    return {"nodes": nodes, "edges": edges}
