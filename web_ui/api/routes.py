"""REST API that the React frontend calls."""
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from mcp_server.tools.analyze import analyze_project
from mcp_server.tools.query import (
    get_project_tree, get_call_graph, get_db_schema, get_routes, get_devops
)
from mcp_server.tools.tracer_tool import trace_execution, get_traces, get_trace_detail
from mcp_server.storage.database import get_db
from mcp_server.config import get_db_path

router = APIRouter(prefix="/api")


class AnalyzeRequest(BaseModel):
    path: str


class TraceRequest(BaseModel):
    path: str
    module_file: str
    function_name: str
    args: list = []
    label: str = None


@router.post("/analyze")
async def api_analyze(req: AnalyzeRequest):
    return await analyze_project(req.path)


@router.get("/tree")
async def api_tree(path: str = Query(...)):
    return await get_project_tree(path)


@router.get("/call-graph")
async def api_call_graph(path: str = Query(...), function_name: str = Query(None)):
    return await get_call_graph(path, function_name)


@router.get("/db-schema")
async def api_db_schema(path: str = Query(...)):
    return await get_db_schema(path)


@router.get("/routes")
async def api_routes(path: str = Query(...)):
    return await get_routes(path)


@router.get("/devops")
async def api_devops(path: str = Query(...)):
    return await get_devops(path)


@router.post("/trace")
async def api_trace(req: TraceRequest):
    return await trace_execution(req.path, req.module_file, req.function_name, req.args, req.label)


@router.get("/traces")
async def api_traces(path: str = Query(...)):
    return await get_traces(path)


@router.get("/trace/{trace_id}")
async def api_trace_detail(trace_id: int, path: str = Query(...)):
    return await get_trace_detail(path, trace_id)


@router.get("/projects")
async def api_projects():
    """List all previously analyzed projects from any known db paths."""
    # We don't have a global registry — return empty for now;
    # the frontend manages project path input.
    return {"projects": []}
