"""Web UI server — serves the REST API and the built React frontend."""
import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

sys.path.insert(0, str(Path(__file__).parent.parent))

from web_ui.api.routes import router
from mcp_server.config import UI_HOST, UI_PORT

app = FastAPI(title="Mental Model UI", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        index = FRONTEND_DIST / "index.html"
        return FileResponse(index)


def main():
    uvicorn.run(
        "web_ui.server:app",
        host=UI_HOST,
        port=UI_PORT,
        reload=False,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
