"""Build networkx call graphs and export to React Flow node/edge format."""
import json
import networkx as nx
from typing import Any


def build_call_graph(functions: list[dict], calls: list[dict]) -> dict:
    """
    functions: [{id, qualified_name, file_role, ...}]
    calls:     [{caller_id, callee_id, callee_name}]
    Returns React Flow {nodes, edges} payload.
    """
    G = nx.DiGraph()

    id_to_func = {f["id"]: f for f in functions}

    for func in functions:
        G.add_node(func["id"], **func)

    for call in calls:
        if call.get("callee_id"):
            G.add_edge(call["caller_id"], call["callee_id"], label=call["callee_name"])

    nodes = []
    edges = []

    # Layered layout using topological sort (best-effort)
    try:
        ordered = list(nx.topological_sort(G))
    except nx.NetworkXUnfeasible:
        ordered = list(G.nodes)

    role_colors = {
        "entrypoint": "#6366f1",
        "router":     "#8b5cf6",
        "view":       "#8b5cf6",
        "service":    "#06b6d4",
        "repository": "#10b981",
        "model":      "#f59e0b",
        "schema":     "#f97316",
        "dependency": "#ec4899",
        "utility":    "#64748b",
        "middleware":  "#ef4444",
        "module":     "#475569",
    }

    col_width, row_height = 280, 120
    layer_map: dict[Any, int] = {}
    for i, nid in enumerate(ordered):
        layer_map[nid] = i

    for nid in ordered:
        func = id_to_func.get(nid)
        if not func:
            continue
        col = layer_map[nid] % 5
        row = layer_map[nid] // 5
        color = role_colors.get(func.get("file_role", "module"), "#475569")
        nodes.append({
            "id": str(nid),
            "type": "custom",
            "position": {"x": col * col_width, "y": row * row_height},
            "data": {
                "label": func.get("name", "?"),
                "qualified_name": func.get("qualified_name", ""),
                "file_role": func.get("file_role", "module"),
                "is_async": func.get("is_async", False),
                "color": color,
                "line_start": func.get("line_start"),
                "line_end": func.get("line_end"),
            },
        })

    for eid, (src, dst, data) in enumerate(G.edges(data=True)):
        edges.append({
            "id": f"e{src}-{dst}",
            "source": str(src),
            "target": str(dst),
            "label": data.get("label", ""),
            "animated": False,
            "style": {"stroke": "#475569"},
        })

    return {"nodes": nodes, "edges": edges}


def build_db_graph(db_models: list[dict]) -> dict:
    """Return React Flow nodes/edges for DB model visualization."""
    nodes = []
    edges = []

    for i, model in enumerate(db_models):
        col = i % 4
        row = i // 4
        nodes.append({
            "id": f"model-{model['id']}",
            "type": "dbModel",
            "position": {"x": col * 320, "y": row * 250},
            "data": {
                "name": model["name"],
                "table_name": model["table_name"],
                "fields": json.loads(model["fields"]) if isinstance(model["fields"], str) else model["fields"],
            },
        })

    return {"nodes": nodes, "edges": edges}
