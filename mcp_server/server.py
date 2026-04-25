"""Main MCP server entry point."""
from fastmcp import FastMCP

from .tools.analyze import analyze_project
from .tools.query import (
    get_project_tree,
    get_call_graph,
    get_db_schema,
    get_routes,
    get_devops,
)
from .tools.tracer_tool import trace_execution, get_traces, get_trace_detail
from .tools.ui_tool import open_ui

mcp = FastMCP(
    name="mental-model",
    instructions=(
        "Builds a persistent mental model of Python backends (FastAPI, Django). "
        "Always call analyze_project first, then use the query tools. "
        "Call open_ui to launch the visual graph interface in the browser."
    ),
)


@mcp.tool()
async def analyze_project_tool(path: str) -> dict:
    """
    Analyze a FastAPI or Django project at the given path.
    Performs full static analysis: project tree, function call graph,
    database models, API routes, and DevOps/infra files (Docker, Nginx, CI/CD, K8s).
    Stores everything in a local SQLite database inside the project.
    Must be called before any other tool.
    """
    return await analyze_project(path)


@mcp.tool()
async def get_project_tree_tool(path: str) -> dict:
    """
    Return the directory/file tree of the project as a nested JSON structure.
    Each node has: name, type (file|dir), path, and children.
    """
    return await get_project_tree(path)


@mcp.tool()
async def get_call_graph_tool(path: str, function_name: str = None) -> dict:
    """
    Return the function call graph as React Flow nodes and edges.
    If function_name is provided, returns only the subgraph reachable from that function (depth ≤ 6).
    Each node carries: label, qualified_name, file_role, is_async, color, line range.
    """
    return await get_call_graph(path, function_name)


@mcp.tool()
async def get_db_schema_tool(path: str) -> dict:
    """
    Return all detected ORM models (SQLAlchemy for FastAPI, Django ORM for Django).
    Returns both a flat list of models+fields and React Flow nodes for visualization.
    """
    return await get_db_schema(path)


@mcp.tool()
async def get_routes_tool(path: str) -> dict:
    """
    Return all API routes detected in the project.
    Each route has: method, path, handler function name, file location, and tags.
    """
    return await get_routes(path)


@mcp.tool()
async def get_devops_tool(path: str) -> dict:
    """
    Return detected DevOps/infra files: Dockerfile, docker-compose, Nginx config,
    GitHub Actions / GitLab CI / CircleCI, Kubernetes manifests, Terraform, Ansible, Makefile.
    Returns both structured file summaries and a React Flow architecture graph showing
    how each tool connects to the application.
    """
    return await get_devops(path)


@mcp.tool()
async def trace_execution_tool(
    path: str,
    module_file: str,
    function_name: str,
    args: list = None,
    label: str = None,
) -> dict:
    """
    Dynamically trace the execution of a function by running it in an instrumented subprocess.
    module_file: relative path to the Python file (e.g. 'app/service.py')
    function_name: name of the function to call
    args: optional list of arguments to pass
    Returns ordered list of function calls with depth, module, file, line, elapsed_ms.
    Trace is saved to the project database.
    """
    return await trace_execution(path, module_file, function_name, args or [], label)


@mcp.tool()
async def get_traces_tool(path: str) -> dict:
    """List all saved execution traces for this project."""
    return await get_traces(path)


@mcp.tool()
async def get_trace_detail_tool(path: str, trace_id: int) -> dict:
    """Return the full call trace data for a specific trace id."""
    return await get_trace_detail(path, trace_id)


@mcp.tool()
async def open_ui_tool(project_path: str = None) -> dict:
    """
    Launch the Mental Model web UI at http://127.0.0.1:7432.
    Optionally pass a project_path to pre-select that project in the UI.
    Returns the URL once the server is ready.
    """
    return await open_ui(project_path)


def main():
    mcp.run()


if __name__ == "__main__":
    main()
